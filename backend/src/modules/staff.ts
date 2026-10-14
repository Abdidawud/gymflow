/**
 * Staff accounts (/users, administrators only; backend design §9, §10).
 * Role changes and deactivation are serialized on an advisory lock so two
 * administrators acting at once can never remove the last active
 * administrator; affected sessions end immediately.
 */

import type { StaffAccount } from "@gymflow/shared/api/types";
import { ROLES, type Role } from "@gymflow/shared/domain/permissions";
import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { z } from "zod";
import type { Tx } from "../db";
import { actorOf, type Env, type RequestContext } from "../http/context";
import { idParam } from "../http/params";
import { parse } from "../http/validation";
import { fail, FieldErrors, notFound } from "../lib/errors";
import { clean, isEmail, normalizeEmail } from "../lib/text";
import { audit } from "../services/audit";
import { hashPassword, meetsPasswordPolicy } from "../services/passwords";
import { revokeSessions } from "../services/sessions";

const ADMIN_LOCK_ID = 730_122_021;

const CreateBody = z.strictObject({
  fullName: z.string().max(500),
  email: z.string().max(1000),
  role: z.string().max(40),
  temporaryPassword: z.string().max(4096),
});
const UpdateBody = z.strictObject({
  fullName: z.string().max(500),
  role: z.string().max(40),
});

const STAFF_COLUMNS = [
  "id",
  "full_name",
  "email",
  "role",
  "is_active",
  "must_change_password",
  "last_sign_in_at",
  "created_at",
] as const;

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_active: boolean;
  must_change_password: boolean;
  last_sign_in_at: Date | null;
  created_at: Date;
};

function staffDto(row: StaffRow): StaffAccount {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    lastSignInAt: row.last_sign_in_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

async function lockAdministrators(tx: Tx): Promise<number> {
  await sql`SELECT pg_advisory_xact_lock(${ADMIN_LOCK_ID})`.execute(tx);
  const row = await tx
    .selectFrom("staff")
    .select(sql<string>`count(*)`.as("count"))
    .where("role", "=", "ADMINISTRATOR")
    .where("is_active", "=", true)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function getStaff(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<StaffRow> {
  const row = await tx
    .selectFrom("staff")
    .select(STAFF_COLUMNS)
    .where("id", "=", id)
    .forUpdate()
    .executeTakeFirst();
  if (!row) notFound(ctx.t);
  return row;
}

export async function staffRoutes(app: FastifyInstance, env: Env) {
  const config = { permission: "staff.manage" as const };

  app.get("/users", { config }, async () => {
    const rows = await env.db
      .selectFrom("staff")
      .select(STAFF_COLUMNS)
      .orderBy("is_active", "desc")
      .orderBy("full_name")
      .execute();
    return rows.map(staffDto);
  });

  app.post("/users", { config }, async (request, reply) => {
    const ctx = request.ctx;
    const { t } = ctx;
    const body = parse(CreateBody, request.body, t);
    const errors = new FieldErrors(t);
    const fullName = clean(body.fullName);
    const email = normalizeEmail(body.email);
    if (!fullName) errors.add("fullName", t("fullName"));
    else if (fullName.length > 80)
      errors.add("fullName", t("maxLength", { max: 80 }));
    if (!isEmail(email)) errors.add("email", t("emailInvalid"));
    if (!isRole(body.role)) errors.add("role", t("chooseRole"));
    if (
      !meetsPasswordPolicy(body.temporaryPassword) ||
      body.temporaryPassword.length > 128
    ) {
      errors.add("temporaryPassword", t("passwordPolicy"));
    }
    errors.throwIfAny();

    const existing = await env.db
      .selectFrom("staff")
      .select("id")
      .where("email", "=", email)
      .executeTakeFirst();
    if (existing)
      fail(409, "DUPLICATE_EMAIL", t("duplicateEmail"), {
        fieldErrors: { email: t("duplicateEmail") },
      });

    const passwordHash = await hashPassword(body.temporaryPassword);
    const row = await env.db.transaction().execute(async (tx) => {
      const now = env.clock.now();
      const created = await tx
        .insertInto("staff")
        .values({
          full_name: fullName!,
          email,
          password_hash: passwordHash,
          role: body.role as Role,
          // A temporary password must be replaced at first sign-in (design.md §7).
          must_change_password: true,
          language: ctx.locale,
          created_at: now,
          updated_at: now,
        })
        .returning(STAFF_COLUMNS)
        .executeTakeFirstOrThrow();
      await audit(
        tx,
        ctx,
        "staff.create",
        { type: "staff", id: created.id },
        { role: created.role },
        now,
      );
      return created;
    });
    return reply.code(201).send(staffDto(row));
  });

  app.patch("/users/:id", { config }, async (request) => {
    const ctx = request.ctx;
    const { t } = ctx;
    const actor = actorOf(ctx);
    const id = idParam(request.params, t);
    const body = parse(UpdateBody, request.body, t);
    const errors = new FieldErrors(t);
    const fullName = clean(body.fullName);
    if (!fullName) errors.add("fullName", t("fullName"));
    else if (fullName.length > 80)
      errors.add("fullName", t("maxLength", { max: 80 }));
    if (!isRole(body.role)) errors.add("role", t("chooseRole"));
    errors.throwIfAny();
    const role = body.role as Role;

    const row = await env.db.transaction().execute(async (tx) => {
      const activeAdmins = await lockAdministrators(tx);
      const target = await getStaff(tx, ctx, id);
      const demoting =
        target.role === "ADMINISTRATOR" &&
        role !== "ADMINISTRATOR" &&
        target.is_active;
      if (demoting && activeAdmins <= 1) {
        fail(409, "LAST_ADMINISTRATOR", t("lastAdmin"), {
          fieldErrors: { role: t("lastAdminField") },
        });
      }
      const now = env.clock.now();
      const updated = await tx
        .updateTable("staff")
        .set({ full_name: fullName!, role, updated_at: now })
        .where("id", "=", id)
        .returning(STAFF_COLUMNS)
        .executeTakeFirstOrThrow();
      if (target.role !== role) {
        // New permissions take effect immediately: the person signs in again.
        if (target.id !== actor.id) await revokeSessions(tx, target.id);
        await audit(
          tx,
          ctx,
          "staff.update",
          { type: "staff", id },
          { role: { from: target.role, to: role } },
          now,
        );
      } else if (target.full_name !== fullName) {
        await audit(
          tx,
          ctx,
          "staff.update",
          { type: "staff", id },
          { fullName: true },
          now,
        );
      }
      return updated;
    });
    return staffDto(row);
  });

  app.post("/users/:id/deactivate", { config }, async (request) => {
    const ctx = request.ctx;
    const { t } = ctx;
    const actor = actorOf(ctx);
    const id = idParam(request.params, t);
    const row = await env.db.transaction().execute(async (tx) => {
      const activeAdmins = await lockAdministrators(tx);
      const target = await getStaff(tx, ctx, id);
      if (target.id === actor.id)
        fail(403, "FORBIDDEN", t("cantDeactivateSelf"));
      if (
        target.role === "ADMINISTRATOR" &&
        target.is_active &&
        activeAdmins <= 1
      ) {
        fail(409, "LAST_ADMINISTRATOR", t("lastAdminShort"));
      }
      if (!target.is_active) return target;
      const now = env.clock.now();
      const updated = await tx
        .updateTable("staff")
        .set({ is_active: false, updated_at: now })
        .where("id", "=", id)
        .returning(STAFF_COLUMNS)
        .executeTakeFirstOrThrow();
      // Access ends immediately, including on devices already signed in.
      await revokeSessions(tx, id);
      await audit(
        tx,
        ctx,
        "staff.deactivate",
        { type: "staff", id },
        null,
        now,
      );
      return updated;
    });
    return staffDto(row);
  });

  app.post("/users/:id/activate", { config }, async (request) => {
    const ctx = request.ctx;
    const id = idParam(request.params, ctx.t);
    const row = await env.db.transaction().execute(async (tx) => {
      const target = await getStaff(tx, ctx, id);
      if (target.is_active) return target;
      const now = env.clock.now();
      const updated = await tx
        .updateTable("staff")
        .set({ is_active: true, updated_at: now })
        .where("id", "=", id)
        .returning(STAFF_COLUMNS)
        .executeTakeFirstOrThrow();
      await audit(tx, ctx, "staff.activate", { type: "staff", id }, null, now);
      return updated;
    });
    return staffDto(row);
  });
}
