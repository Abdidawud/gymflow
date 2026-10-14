/**
 * Members (backend design §9): list and lookup, registration, profile edits,
 * archive/reactivate, payment and period histories, and private photos.
 */

import type { MemberInput, MemberMembershipHistoryItem } from "@gymflow/shared/api/types";
import {
  displayPeriod,
  matchesMemberSearch,
  matchesStatusFilter,
  paginate,
  sortMembers,
} from "@gymflow/shared/domain/member-list";
import { MEMBERSHIP_STATUSES } from "@gymflow/shared/domain/membership";
import { normalizeEthiopianPhone } from "@gymflow/shared/domain/phone";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db, Tx } from "../db";
import { actorOf, can, type Env, type RequestContext } from "../http/context";
import { idParam, PageQuery } from "../http/params";
import { parse } from "../http/validation";
import { fail, FieldErrors, notFound } from "../lib/errors";
import { clean, cleanMultiline, isEmail } from "../lib/text";
import { audit } from "../services/audit";
import { processPhoto, readUpload } from "../services/images";
import {
  fullName,
  loadRelevantPeriods,
  memberDetailDto,
  memberSummaryDto,
  type MemberRow,
  periodDto,
  selectMembers,
} from "../services/members";
import { paymentSummaryDto, selectPayments } from "../services/payments";
import { hasEnabledPlans, readSettings } from "../services/settings";

const ListQuery = z.strictObject({
  search: z.string().max(200).optional(),
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
  planId: z.string().max(64).optional(),
  archived: z.enum(["true", "false", "any"]).optional(),
  phone: z.string().max(40).optional(),
  sort: z.enum(["name", "memberCode", "endDate", "registrationDate"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const text = (max: number) => z.string().max(max).nullable();
const MemberBody = z.strictObject({
  firstName: z.string().max(500),
  lastName: z.string().max(500),
  phone: z.string().max(100),
  email: text(1000),
  gender: text(20),
  emergencyName: text(500),
  emergencyPhone: text(100),
  emergencyRelationship: text(500),
  address: text(2000),
  notes: text(5000),
});

type MemberValues = Omit<MemberInput, "gender"> & {
  gender: "MALE" | "FEMALE" | null;
};

/** Same checks and wording as the registration form (design.md §10). */
async function validateMember(
  db: Db | Tx,
  ctx: RequestContext,
  input: z.infer<typeof MemberBody>,
  excludeId?: string,
): Promise<MemberValues> {
  const { t } = ctx;
  const errors = new FieldErrors(t);
  const firstName = clean(input.firstName);
  const lastName = clean(input.lastName);
  if (!firstName) errors.add("firstName", t("firstName"));
  else if (firstName.length > 60) errors.add("firstName", t("maxLength", { max: 60 }));
  if (!lastName) errors.add("lastName", t("lastName"));
  else if (lastName.length > 60) errors.add("lastName", t("maxLength", { max: 60 }));

  const phone = normalizeEthiopianPhone(input.phone ?? "");
  if (!phone) errors.add("phone", t("mobileInvalid"));

  const email = clean(input.email)?.toLowerCase() ?? null;
  if (email && !isEmail(email)) errors.add("email", t("emailInvalid"));

  const emergencyName = clean(input.emergencyName);
  const emergencyPhoneRaw = clean(input.emergencyPhone);
  const emergencyPhone = emergencyPhoneRaw ? normalizeEthiopianPhone(emergencyPhoneRaw, "any") : null;
  if (emergencyName && !emergencyPhoneRaw) errors.add("emergencyPhone", t("emergencyPhone"));
  if (emergencyPhoneRaw && !emergencyName) errors.add("emergencyName", t("emergencyName"));
  if (emergencyPhoneRaw && !emergencyPhone) errors.add("emergencyPhone", t("phoneInvalid"));
  if (emergencyName && emergencyName.length > 80) errors.add("emergencyName", t("maxLength", { max: 80 }));

  const relationship = clean(input.emergencyRelationship);
  if (relationship && relationship.length > 40) errors.add("emergencyRelationship", t("maxLength", { max: 40 }));
  const address = clean(input.address);
  if (address && address.length > 200) errors.add("address", t("maxLength", { max: 200 }));
  const notes = cleanMultiline(input.notes);
  if (notes && notes.length > 1000) errors.add("notes", t("maxLength", { max: 1000 }));
  if (input.gender !== null && input.gender !== "MALE" && input.gender !== "FEMALE") {
    errors.add("gender", t("validOption"));
  }
  errors.throwIfAny();

  let duplicateQuery = db
    .selectFrom("members")
    .select(["id", "member_code", "first_name", "last_name"])
    .where("phone", "=", phone!);
  if (excludeId) duplicateQuery = duplicateQuery.where("id", "!=", excludeId);
  const duplicate = await duplicateQuery.executeTakeFirst();
  if (duplicate) {
    fail(409, "DUPLICATE_PHONE", t("duplicatePhone"), {
      fieldErrors: {
        phone: t("duplicatePhoneField", {
          name: fullName(duplicate),
          code: duplicate.member_code,
        }),
      },
      // An authorized route to the existing record (backend design §10).
      details: {
        member: {
          id: duplicate.id,
          memberCode: duplicate.member_code,
          fullName: fullName(duplicate),
        },
      },
    });
  }

  return {
    firstName: firstName!,
    lastName: lastName!,
    phone: phone!,
    email,
    gender: input.gender as MemberValues["gender"],
    emergencyName,
    emergencyPhone: emergencyName ? emergencyPhone : null,
    emergencyRelationship: emergencyName ? relationship : null,
    address,
    notes,
  };
}

function columnsOf(values: MemberValues) {
  return {
    first_name: values.firstName,
    last_name: values.lastName,
    phone: values.phone,
    email: values.email,
    gender: values.gender,
    emergency_name: values.emergencyName,
    emergency_phone: values.emergencyPhone,
    emergency_relationship: values.emergencyRelationship,
    address: values.address,
    notes: values.notes,
  };
}

export async function getMemberRow(db: Db | Tx, ctx: RequestContext, id: string, lock = false): Promise<MemberRow> {
  let query = selectMembers(db).where("members.id", "=", id);
  if (lock) query = query.forUpdate();
  const member = await query.executeTakeFirst();
  if (!member) notFound(ctx.t);
  return member;
}

export async function memberRoutes(app: FastifyInstance, env: Env) {
  async function detail(db: Db | Tx, ctx: RequestContext, member: MemberRow) {
    const [settings, hasPlans] = await Promise.all([readSettings(db), hasEnabledPlans(db)]);
    return memberDetailDto(env, db, member, {
      today: env.clock.today(),
      warningDays: settings.expirationWarningDays,
      canArchive: can(ctx, "members.archive"),
      hasPlans,
    });
  }

  app.get("/members", async (request) => {
    const { t } = request.ctx;
    const query = parse(ListQuery, request.query, t);
    const today = env.clock.today();
    const settings = await readSettings(env.db);

    let rows = selectMembers(env.db);
    if (query.archived !== "any") rows = rows.where("members.is_archived", "=", query.archived === "true");

    // Exact phone lookup (after normalization) for duplicate warnings on the form.
    if (query.phone !== undefined) {
      const phone = normalizeEthiopianPhone(query.phone);
      if (!phone) return paginate([], 1, query.pageSize);
      rows = rows.where("members.phone", "=", phone);
    }

    const members = (await rows.execute()).filter((m) =>
      matchesMemberSearch(
        {
          memberCode: m.member_code,
          phone: m.phone,
          firstName: m.first_name,
          lastName: m.last_name,
          email: m.email,
        },
        query.search,
      ),
    );
    const periods = await loadRelevantPeriods(
      env.db,
      today,
      members.map((m) => m.id),
    );
    const summaries = members
      .map((m) => memberSummaryDto(env, m, periods.get(m.id) ?? [], today, settings.expirationWarningDays))
      .filter((row) => matchesStatusFilter(row.membership.status, query.status))
      .filter((row) => !query.planId || displayPeriod(row.membership)?.planId === query.planId);
    return paginate(sortMembers(summaries, query.sort, query.order), query.page, query.pageSize);
  });

  app.post("/members", async (request, reply) => {
    const ctx = request.ctx;
    const body = parse(MemberBody, request.body, ctx.t);
    const values = await validateMember(env.db, ctx, body);
    const now = env.clock.now();
    const { id } = await env.db
      .insertInto("members")
      .values({
        ...columnsOf(values),
        registration_date: env.clock.today(),
        created_at: now,
        updated_at: now,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const member = await getMemberRow(env.db, ctx, id);
    return reply.code(201).send(await detail(env.db, ctx, member));
  });

  app.get("/members/:id", async (request) => {
    const ctx = request.ctx;
    return detail(env.db, ctx, await getMemberRow(env.db, ctx, idParam(request.params, ctx.t)));
  });

  app.patch("/members/:id", async (request) => {
    const ctx = request.ctx;
    const id = idParam(request.params, ctx.t);
    const body = parse(MemberBody, request.body, ctx.t);
    await getMemberRow(env.db, ctx, id);
    const values = await validateMember(env.db, ctx, body, id);
    await env.db
      .updateTable("members")
      .set({ ...columnsOf(values), updated_at: env.clock.now() })
      .where("id", "=", id)
      .execute();
    return detail(env.db, ctx, await getMemberRow(env.db, ctx, id));
  });

  for (const action of ["archive", "reactivate"] as const) {
    app.post(`/members/:id/${action}`, { config: { permission: "members.archive" } }, async (request) => {
      const ctx = request.ctx;
      const id = idParam(request.params, ctx.t);
      return env.db.transaction().execute(async (tx) => {
        const member = await getMemberRow(tx, ctx, id, true);
        const archive = action === "archive";
        if (member.is_archived !== archive) {
          const now = env.clock.now();
          await tx
            .updateTable("members")
            .set({
              is_archived: archive,
              archived_at: archive ? now : null,
              updated_at: now,
            })
            .where("id", "=", id)
            .execute();
          await audit(
            tx,
            ctx,
            archive ? "member.archive" : "member.reactivate",
            { type: "member", id },
            { memberCode: member.member_code },
            now,
          );
        }
        return detail(tx, ctx, await getMemberRow(tx, ctx, id));
      });
    });
  }

  app.get("/members/:id/payments", async (request) => {
    const ctx = request.ctx;
    const id = idParam(request.params, ctx.t);
    const { page = 1, pageSize = 10 } = parse(PageQuery, request.query, ctx.t);
    await getMemberRow(env.db, ctx, id);
    const [{ count }, rows] = await Promise.all([
      env.db
        .selectFrom("payments")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("member_id", "=", id)
        .executeTakeFirstOrThrow(),
      selectPayments(env.db)
        .where("p.member_id", "=", id)
        .orderBy("p.created_at", "desc")
        .orderBy("p.id")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute(),
    ]);
    return {
      items: rows.map((row) => paymentSummaryDto(env, ctx, row)),
      total: Number(count),
      page,
      pageSize,
    };
  });

  app.get("/members/:id/memberships", async (request) => {
    const ctx = request.ctx;
    const id = idParam(request.params, ctx.t);
    const { page = 1, pageSize = 10 } = parse(PageQuery, request.query, ctx.t);
    await getMemberRow(env.db, ctx, id);
    const today = env.clock.today();
    const base = env.db
      .selectFrom("memberships as m")
      .innerJoin("payments as p", "p.membership_id", "m.id")
      .where("m.member_id", "=", id);
    const [{ count }, rows] = await Promise.all([
      base.select((eb) => eb.fn.countAll<string>().as("count")).executeTakeFirstOrThrow(),
      base
        .select([
          "m.id",
          "m.member_id",
          "m.plan_id",
          "m.plan_name_snapshot",
          "m.price_snapshot",
          "m.duration_days_snapshot",
          "m.start_date",
          "m.end_date",
          "m.is_renewal",
          "m.created_at",
          "p.id as payment_id",
          "p.payment_code",
        ])
        .orderBy("m.start_date", "desc")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute(),
    ]);
    const items: MemberMembershipHistoryItem[] = rows.map((row) => ({
      ...periodDto(row),
      periodStatus: row.start_date > today ? "UPCOMING" : row.end_date < today ? "ENDED" : "CURRENT",
    }));
    return { items, total: Number(count), page, pageSize };
  });

  app.post("/members/:id/photo", async (request) => {
    const ctx = request.ctx;
    const id = idParam(request.params, ctx.t);
    await getMemberRow(env.db, ctx, id);
    const image = await processPhoto(await readUpload(request, "photo", ctx.t), ctx.t);

    // The new image, the member's reference and removal of the old image commit together.
    await env.db.transaction().execute(async (tx) => {
      const member = await getMemberRow(tx, ctx, id, true);
      const key = env.storage.newKey("members", id, "jpg");
      await env.storage.put(tx, key, { contentType: "image/jpeg", data: image });
      const now = env.clock.now();
      await tx
        .updateTable("members")
        .set({ photo_storage_key: key, photo_updated_at: now, updated_at: now })
        .where("id", "=", id)
        .execute();
      if (member.photo_storage_key) await env.storage.delete(tx, member.photo_storage_key);
    });
    return detail(env.db, ctx, await getMemberRow(env.db, ctx, id));
  });

  app.delete("/members/:id/photo", async (request) => {
    const ctx = request.ctx;
    const id = idParam(request.params, ctx.t);
    await env.db.transaction().execute(async (tx) => {
      const member = await getMemberRow(tx, ctx, id, true);
      if (!member.photo_storage_key) return;
      await tx
        .updateTable("members")
        .set({ photo_storage_key: null, photo_updated_at: null, updated_at: env.clock.now() })
        .where("id", "=", id)
        .execute();
      await env.storage.delete(tx, member.photo_storage_key);
    });
    return detail(env.db, ctx, await getMemberRow(env.db, ctx, id));
  });

  // Photos are personal data: served only to signed-in staff, never from a public URL.
  app.get("/members/:id/photo", async (request, reply) => {
    const ctx = request.ctx;
    actorOf(ctx);
    const member = await getMemberRow(env.db, ctx, idParam(request.params, ctx.t));
    const file = member.photo_storage_key ? await env.storage.get(env.db, member.photo_storage_key) : null;
    if (!file) notFound(ctx.t);
    return reply
      .header("Content-Type", file.contentType)
      .header("Cache-Control", "private, max-age=31536000, immutable")
      .header("Content-Disposition", "inline")
      .send(file.data);
  });
}
