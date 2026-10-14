/**
 * Payments (backend design §5, §9, §10):
 *   POST /payments/preview  price and coverage dates, no write
 *   POST /payments          record a received full payment (Idempotency-Key)
 *   GET  /payments, /payments/{id}, /payments/{id}/receipt
 *
 * Recording is one transaction: reserve the operation key, lock the member,
 * re-check the preview, then insert the period, the payment and an audit
 * event. A lost response is resolved by retrying with the same key, which
 * returns the original payment; a different body under the same key is refused.
 */

import {
  PAYMENT_METHODS,
  type PaymentPreview,
  type PaymentMethod,
} from "@gymflow/shared/api/types";
import {
  addDays,
  daysBetween,
  isDateOnly,
  type DateOnly,
} from "@gymflow/shared/domain/dates";
import {
  findOverlap,
  membershipEndDate,
  proposeStartDate,
} from "@gymflow/shared/domain/membership";
import { sumMoney } from "@gymflow/shared/domain/money";
import { phoneSearchDigits } from "@gymflow/shared/domain/phone";
import type { FastifyInstance } from "fastify";
import { sql, type RawBuilder } from "kysely";
import { z } from "zod";
import type { Db, Tx } from "../db";
import { actorOf, can, type Env, type RequestContext } from "../http/context";
import { idParam, isUuid } from "../http/params";
import { parse } from "../http/validation";
import { fingerprint } from "../lib/crypto";
import { fail, FieldErrors, invalid, notFound } from "../lib/errors";
import { dateText } from "../lib/i18n";
import { clean, cleanMultiline } from "../lib/text";
import { audit } from "../services/audit";
import {
  loadRelevantPeriods,
  memberSummaryDto,
  periodDto,
  type PeriodRow,
} from "../services/members";
import {
  paymentDetailDto,
  paymentSummaryDto,
  selectPayments,
} from "../services/payments";
import { readSettings, type SettingsRow } from "../services/settings";
import { getMemberRow } from "./members";

const PreviewBody = z.strictObject({
  memberId: z.string().max(64),
  planId: z.string().max(64),
  requestedStartDate: z.string().max(20).optional(),
});

const RecordBody = z.strictObject({
  memberId: z.string().max(64),
  planId: z.string().max(64),
  paymentMethod: z.string().max(40),
  receivedDate: z.string().max(20),
  requestedStartDate: z.string().max(20).optional(),
  reference: z.string().max(500).nullable(),
  notes: z.string().max(5000).nullable(),
  previewFingerprint: z.string().max(100),
});

const date = z.string().refine(isDateOnly);
const ListQuery = z.strictObject({
  search: z.string().max(200).optional(),
  from: date.optional(),
  to: date.optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  planId: z.string().max(64).optional(),
  memberId: z.string().max(64).optional(),
  sort: z.enum(["receivedDate", "amount", "createdAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

const asCoverage = (p: PeriodRow) => ({
  ...p,
  startDate: p.start_date,
  endDate: p.end_date,
});

interface ComputedPreview {
  preview: PaymentPreview;
  plan: { id: string; name: string; price: string; duration_days: number };
}

/** Price and coverage dates for a purchase, exactly as confirmation will record them. */
async function computePreview(
  env: Env,
  ctx: RequestContext,
  db: Db | Tx,
  input: z.infer<typeof PreviewBody>,
  settings: SettingsRow,
  lock: boolean,
): Promise<ComputedPreview> {
  const { t, locale } = ctx;
  if (!isUuid(input.memberId)) notFound(t);
  const member = await getMemberRow(
    db,
    ctx,
    input.memberId.toLowerCase(),
    lock,
  );
  if (member.is_archived) fail(422, "MEMBER_ARCHIVED", t("memberArchived"));

  let planQuery = db
    .selectFrom("plans")
    .select(["id", "name", "price", "duration_days", "is_enabled"])
    .where(
      "id",
      "=",
      isUuid(input.planId)
        ? input.planId.toLowerCase()
        : "00000000-0000-0000-0000-000000000000",
    );
  if (lock) planQuery = planQuery.forShare();
  const plan = await planQuery.executeTakeFirst();
  if (!plan) fail(404, "NOT_FOUND", t("planNotFound"));
  if (!plan.is_enabled) {
    fail(422, "PLAN_DISABLED", t("planDisabled"), {
      fieldErrors: { planId: t("chooseEnabledPlan") },
    });
  }

  const today = env.clock.today();
  const periods =
    (await loadRelevantPeriods(db, today, [member.id])).get(member.id) ?? [];
  const coverage = periods.map(asCoverage);
  const proposed = proposeStartDate(coverage, today);
  let startDate = proposed.startDate;
  if (!proposed.automatic && input.requestedStartDate) {
    const requested = input.requestedStartDate;
    if (!isDateOnly(requested))
      invalid(t, { requestedStartDate: t("validStartDate") });
    if (requested < today) invalid(t, { requestedStartDate: t("startInPast") });
    if (daysBetween(today, requested) > 365)
      invalid(t, { requestedStartDate: t("startTooFar") });
    startDate = requested;
  }
  const endDate = membershipEndDate(startDate, plan.duration_days);

  const overlap = findOverlap(coverage, startDate, endDate);
  if (overlap) {
    const suggested = addDays(overlap.endDate, 1);
    const start = dateText(locale, overlap.startDate);
    const end = dateText(locale, overlap.endDate);
    fail(409, "DATE_CONFLICT", t("overlap", { start, end }), {
      fieldErrors: {
        requestedStartDate: t("overlapField", {
          start,
          end,
          suggested: dateText(locale, suggested),
        }),
      },
      details: {
        conflictStart: overlap.startDate,
        conflictEnd: overlap.endDate,
        suggestedStart: suggested,
      },
    });
  }

  // Anything that would change the recorded outcome changes the fingerprint.
  const previewFingerprint = fingerprint({
    memberId: member.id,
    planId: plan.id,
    price: plan.price,
    durationDays: plan.duration_days,
    startDate,
    endDate,
    automatic: proposed.automatic,
    coverage: periods.map((p) => [p.id, p.start_date, p.end_date]),
  });

  return {
    plan,
    preview: {
      member: memberSummaryDto(
        env,
        member,
        periods,
        today,
        settings.expirationWarningDays,
      ),
      plan: {
        id: plan.id,
        name: plan.name,
        durationDays: plan.duration_days,
        price: plan.price,
      },
      amount: plan.price,
      currency: "ETB",
      startDate,
      endDate,
      startIsAutomatic: proposed.automatic,
      minStartDate: proposed.automatic ? startDate : today,
      isRenewal: periods.length > 0,
      existingCoverage: periods
        .filter((p) => p.end_date >= today)
        .map(periodDto),
      previewFingerprint,
    },
  };
}

function validatePaymentFields(
  ctx: RequestContext,
  body: z.infer<typeof RecordBody>,
  settings: SettingsRow,
  today: DateOnly,
): { method: PaymentMethod; reference: string | null; notes: string | null } {
  const { t } = ctx;
  const errors = new FieldErrors(t);
  const method = body.paymentMethod as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method))
    errors.add("paymentMethod", t("choosePaymentMethod"));
  else if (!settings.enabledPaymentMethods.includes(method)) {
    fail(422, "PAYMENT_METHOD_DISABLED", t("methodDisabled"), {
      fieldErrors: { paymentMethod: t("chooseEnabledMethod") },
    });
  }
  if (!isDateOnly(body.receivedDate))
    errors.add("receivedDate", t("receivedDate"));
  else if (body.receivedDate > today)
    errors.add("receivedDate", t("receivedDateFuture"));

  const reference = clean(body.reference);
  if (method !== "CASH" && !reference) errors.add("reference", t("reference"));
  if (reference && reference.length > 64)
    errors.add("reference", t("maxLength", { max: 64 }));
  const notes = cleanMultiline(body.notes);
  if (notes && notes.length > 500)
    errors.add("notes", t("maxLength", { max: 500 }));
  errors.throwIfAny();
  return { method, reference, notes };
}

/** SQL for the member lookup rules in shared/domain/member-list.ts (ID, phone digits, name words). */
function memberSearchSql(raw: string): RawBuilder<boolean> {
  const query = raw.trim().replace(/\s+/g, " ").toLowerCase();
  const like = (value: string) =>
    `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const memberNumber = sql`substring(mb.member_code from 5)::bigint`;

  const code = /^(?:gym)?[\s-]?0*(\d+)$/i.exec(query.replace(/\s/g, ""));
  if (code && query.startsWith("gym"))
    return sql<boolean>`${memberNumber} = ${Number(code[1])}`;

  const options: RawBuilder<boolean>[] = [];
  if (code) options.push(sql<boolean>`${memberNumber} = ${Number(code[1])}`);
  const digits = phoneSearchDigits(query);
  if (digits)
    options.push(sql<boolean>`substring(mb.phone from 5) LIKE ${like(digits)}`);
  const words = query
    .split(" ")
    .map(
      (word) =>
        sql<boolean>`lower(mb.first_name || ' ' || mb.last_name || ' ' || coalesce(mb.email, '')) LIKE ${like(word)}`,
    );
  options.push(sql<boolean>`(${sql.join(words, sql` AND `)})`);
  return sql<boolean>`(${sql.join(options, sql` OR `)})`;
}

export async function paymentRoutes(app: FastifyInstance, env: Env) {
  async function loadDetail(ctx: RequestContext, id: string) {
    const row = await selectPayments(env.db)
      .where("p.id", "=", id)
      .executeTakeFirst();
    if (!row) notFound(ctx.t);
    return paymentDetailDto(env, ctx, row);
  }

  app.post("/payments/preview", async (request) => {
    const ctx = request.ctx;
    const body = parse(PreviewBody, request.body, ctx.t);
    const settings = await readSettings(env.db);
    return (await computePreview(env, ctx, env.db, body, settings, false))
      .preview;
  });

  app.post("/payments", async (request, reply) => {
    const ctx = request.ctx;
    const { t } = ctx;
    const actor = actorOf(ctx);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || !isUuid(key))
      fail(400, "VALIDATION_FAILED", t("missingIdempotencyKey"));
    const body = parse(RecordBody, request.body, t);
    const requestFingerprint = fingerprint({
      memberId: body.memberId.toLowerCase(),
      planId: body.planId.toLowerCase(),
      paymentMethod: body.paymentMethod,
      receivedDate: body.receivedDate,
      requestedStartDate: body.requestedStartDate ?? null,
      reference: clean(body.reference),
      notes: cleanMultiline(body.notes),
      previewFingerprint: body.previewFingerprint,
    });

    const outcome = await env.db.transaction().execute(async (tx) => {
      const now = env.clock.now();
      // Reserve the operation key. A concurrent request with the same key waits
      // here until the first one commits (then replays) or rolls back.
      const reserved = await tx
        .insertInto("idempotency_keys")
        .values({
          staff_id: actor.id,
          request_key: key.toLowerCase(),
          request_fingerprint: requestFingerprint,
          created_at: now,
        })
        .onConflict((oc) => oc.columns(["staff_id", "request_key"]).doNothing())
        .returning("request_key")
        .executeTakeFirst();
      if (!reserved) {
        const existing = await tx
          .selectFrom("idempotency_keys")
          .select(["request_fingerprint", "payment_id"])
          .where("staff_id", "=", actor.id)
          .where("request_key", "=", key.toLowerCase())
          .executeTakeFirstOrThrow();
        if (
          existing.request_fingerprint !== requestFingerprint ||
          !existing.payment_id
        ) {
          fail(409, "IDEMPOTENCY_CONFLICT", t("idempotencyConflict"));
        }
        return { paymentId: existing.payment_id, replayed: true };
      }

      // Settings and the member are locked so the checks below still hold at commit.
      const settings = await readSettings(tx, { lock: "share" });
      const today = env.clock.today();
      const fields = validatePaymentFields(ctx, body, settings, today);
      const { preview, plan } = await computePreview(
        env,
        ctx,
        tx,
        {
          memberId: body.memberId,
          planId: body.planId,
          requestedStartDate: body.requestedStartDate,
        },
        settings,
        true,
      );
      if (preview.previewFingerprint !== body.previewFingerprint)
        fail(409, "STALE_PREVIEW", t("previewChanged"));

      const membership = await tx
        .insertInto("memberships")
        .values({
          member_id: preview.member.id,
          plan_id: plan.id,
          plan_name_snapshot: plan.name,
          price_snapshot: plan.price,
          duration_days_snapshot: plan.duration_days,
          start_date: preview.startDate,
          end_date: preview.endDate,
          is_renewal: preview.isRenewal,
          created_at: now,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      // The amount comes from the plan on the server, never from the request.
      const payment = await tx
        .insertInto("payments")
        .values({
          member_id: preview.member.id,
          membership_id: membership.id,
          amount: plan.price,
          method: fields.method,
          received_date: body.receivedDate,
          reference: fields.reference,
          notes: fields.notes,
          recorded_by: actor.id,
          created_at: now,
        })
        .returning(["id", "payment_code"])
        .executeTakeFirstOrThrow();
      await tx
        .updateTable("idempotency_keys")
        .set({ payment_id: payment.id })
        .where("staff_id", "=", actor.id)
        .where("request_key", "=", key.toLowerCase())
        .execute();
      await audit(
        tx,
        ctx,
        "payment.create",
        { type: "payment", id: payment.id },
        {
          paymentCode: payment.payment_code,
          memberCode: preview.member.memberCode,
          amount: plan.price,
          method: fields.method,
          coverage: [preview.startDate, preview.endDate],
        },
        now,
      );
      return { paymentId: payment.id, replayed: false };
    });

    const payment = await loadDetail(ctx, outcome.paymentId);
    // 201 = newly recorded; 200 = the same operation replayed.
    return reply.code(outcome.replayed ? 200 : 201).send({ payment });
  });

  app.get("/payments", async (request) => {
    const ctx = request.ctx;
    const query = parse(ListQuery, request.query, ctx.t);
    const conditions: RawBuilder<boolean>[] = [];
    if (query.from)
      conditions.push(sql<boolean>`p.received_date >= ${query.from}`);
    if (query.to) conditions.push(sql<boolean>`p.received_date <= ${query.to}`);
    if (query.method) conditions.push(sql<boolean>`p.method = ${query.method}`);
    if (query.memberId)
      conditions.push(
        isUuid(query.memberId)
          ? sql<boolean>`p.member_id = ${query.memberId}`
          : sql<boolean>`false`,
      );
    if (query.planId)
      conditions.push(
        isUuid(query.planId)
          ? sql<boolean>`ms.plan_id = ${query.planId}`
          : sql<boolean>`false`,
      );
    const search = (query.search ?? "").trim().toLowerCase();
    if (search) {
      const options: RawBuilder<boolean>[] = [memberSearchSql(search)];
      const paymentNumber = /^(?:pay)?[\s-]?0*(\d{3,})$/i.exec(
        search.replace(/\s/g, ""),
      );
      if (paymentNumber) {
        options.push(
          sql<boolean>`substring(p.payment_code from 5)::bigint = ${Number(paymentNumber[1])}`,
        );
      }
      const escaped = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      options.push(sql<boolean>`lower(p.reference) LIKE ${escaped}`);
      conditions.push(sql<boolean>`(${sql.join(options, sql` OR `)})`);
    }
    const where =
      conditions.length > 0
        ? sql<boolean>`${sql.join(conditions, sql` AND `)}`
        : sql<boolean>`true`;

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const direction = query.order === "asc" ? sql`ASC` : sql`DESC`;
    const sortColumn =
      query.sort === "amount"
        ? sql`p.amount`
        : query.sort === "createdAt"
          ? sql`p.created_at`
          : sql`p.received_date`;

    const [totals, rows] = await Promise.all([
      env.db
        .selectFrom("payments as p")
        .innerJoin("memberships as ms", "ms.id", "p.membership_id")
        .innerJoin("members as mb", "mb.id", "p.member_id")
        .select([
          sql<string>`count(*)`.as("count"),
          sql<string>`coalesce(sum(p.amount), 0)::numeric(14, 2)`.as("total"),
        ])
        .where(where)
        .executeTakeFirstOrThrow(),
      selectPayments(env.db)
        .where(where)
        .orderBy(sql`${sortColumn} ${direction}`)
        .orderBy(sql`p.created_at ${direction}`)
        .orderBy("p.id")
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .execute(),
    ]);
    return {
      items: rows.map((row) => paymentSummaryDto(env, ctx, row)),
      total: Number(totals.count),
      page,
      pageSize,
      // Gym-wide revenue is for administrators only (backend design §3).
      summary: can(ctx, "revenue.view")
        ? {
            totalRevenue: sumMoney([totals.total]),
            transactions: Number(totals.count),
          }
        : null,
    };
  });

  app.get("/payments/:id", async (request) =>
    loadDetail(request.ctx, idParam(request.params, request.ctx.t)),
  );

  app.get("/payments/:id/receipt", async (request) => {
    const ctx = request.ctx;
    const payment = await loadDetail(ctx, idParam(request.params, ctx.t));
    const settings = await readSettings(env.db);
    return {
      gym: {
        name: settings.gymName,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        logoUrl: settings.logoUpdatedAt
          ? `${env.config.publicApiPath}/settings/logo?v=${settings.logoUpdatedAt.getTime()}`
          : null,
      },
      payment,
    };
  });
}
