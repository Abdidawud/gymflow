/**
 * Gym settings (administrators; backend design §6, §9) and the gym logo.
 * The logo image itself is readable by any signed-in staff member because
 * receptionists print receipts.
 */

import {
  PAYMENT_METHODS,
  type GymSettings,
  type PaymentMethod,
} from "@gymflow/shared/api/types";
import { normalizeEthiopianPhone } from "@gymflow/shared/domain/phone";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db";
import type { Env, RequestContext } from "../http/context";
import { parse } from "../http/validation";
import { FieldErrors, notFound } from "../lib/errors";
import { clean, isEmail } from "../lib/text";
import { audit } from "../services/audit";
import { processLogo, readUpload } from "../services/images";
import { readSettings, type SettingsRow } from "../services/settings";

const LOGO_OWNER = "00000000-0000-0000-0000-000000000000";

const UpdateBody = z.strictObject({
  gymName: z.string().max(500).optional(),
  phone: z.string().max(100).nullable().optional(),
  email: z.string().max(1000).nullable().optional(),
  address: z.string().max(2000).nullable().optional(),
  logoUrl: z.string().max(2000).nullable().optional(),
  expirationWarningDays: z.union([z.number(), z.string().max(10)]).optional(),
  enabledPaymentMethods: z.array(z.string().max(40)).max(10).optional(),
});

export function logoUrl(env: Env, settings: SettingsRow): string | null {
  return settings.logoUpdatedAt
    ? `${env.config.publicApiPath}/settings/logo?v=${settings.logoUpdatedAt.getTime()}`
    : null;
}

async function settingsDto(env: Env, db: Db): Promise<GymSettings> {
  const settings = await readSettings(db);
  const updatedBy = settings.updatedBy
    ? await db
        .selectFrom("staff")
        .select(["id", "full_name"])
        .where("id", "=", settings.updatedBy)
        .executeTakeFirst()
    : undefined;
  return {
    gymName: settings.gymName,
    phone: settings.phone,
    email: settings.email,
    address: settings.address,
    logoUrl: logoUrl(env, settings),
    currency: "ETB",
    timezone: "Africa/Addis_Ababa",
    expirationWarningDays: settings.expirationWarningDays,
    enabledPaymentMethods: settings.enabledPaymentMethods,
    updatedAt: settings.updatedAt.toISOString(),
    updatedBy: updatedBy
      ? { id: updatedBy.id, fullName: updatedBy.full_name }
      : null,
  };
}

function validate(ctx: RequestContext, input: z.infer<typeof UpdateBody>) {
  const { t } = ctx;
  const errors = new FieldErrors(t);
  const changes: Record<string, unknown> = {};
  let removeLogo = false;

  if (input.gymName !== undefined) {
    const name = clean(input.gymName);
    if (!name) errors.add("gymName", t("gymName"));
    else if (name.length > 80)
      errors.add("gymName", t("maxLength", { max: 80 }));
    else changes.gym_name = name;
  }
  if (input.phone !== undefined) {
    const raw = clean(input.phone);
    const phone = raw ? normalizeEthiopianPhone(raw, "any") : null;
    if (raw && !phone) errors.add("phone", t("phoneInvalid"));
    else changes.phone = phone;
  }
  if (input.email !== undefined) {
    const email = clean(input.email)?.toLowerCase() ?? null;
    if (email && !isEmail(email)) errors.add("email", t("emailInvalid"));
    else changes.email = email;
  }
  if (input.address !== undefined) {
    const address = clean(input.address);
    if (address && address.length > 200)
      errors.add("address", t("maxLength", { max: 200 }));
    else changes.address = address;
  }
  if (input.logoUrl !== undefined) {
    // The logo is uploaded (POST /settings/logo); a link can only be cleared, never set.
    if (input.logoUrl === null) removeLogo = true;
    else errors.add("logoUrl", t("logoUrl"));
  }
  if (input.expirationWarningDays !== undefined) {
    const days = Number(input.expirationWarningDays);
    if (!Number.isInteger(days) || days < 0 || days > 30)
      errors.add("expirationWarningDays", t("warningDays"));
    else changes.expiration_warning_days = days;
  }
  if (input.enabledPaymentMethods !== undefined) {
    const methods = PAYMENT_METHODS.filter((m) =>
      input.enabledPaymentMethods!.includes(m),
    );
    if (methods.length === 0)
      errors.add("enabledPaymentMethods", t("atLeastOneMethod"));
    else changes.enabled_payment_methods = methods as PaymentMethod[];
  }
  errors.throwIfAny();
  return { changes, removeLogo };
}

export async function settingsRoutes(app: FastifyInstance, env: Env) {
  const config = { permission: "settings.manage" as const };

  app.get("/settings", { config }, async () => settingsDto(env, env.db));

  app.patch("/settings", { config }, async (request) => {
    const ctx = request.ctx;
    const { changes, removeLogo } = validate(
      ctx,
      parse(UpdateBody, request.body, ctx.t),
    );
    const previousLogo = await env.db.transaction().execute(async (tx) => {
      const before = await readSettings(tx, { lock: "update" });
      const now = env.clock.now();
      await tx
        .updateTable("gym_settings")
        .set({
          ...changes,
          ...(removeLogo
            ? { logo_storage_key: null, logo_updated_at: null }
            : {}),
          updated_at: now,
          updated_by: ctx.actor?.id ?? null,
        })
        .execute();
      const changed = [
        ...Object.keys(changes),
        ...(removeLogo && before.logoStorageKey ? ["logo"] : []),
      ];
      if (changed.length > 0)
        await audit(
          tx,
          ctx,
          "settings.update",
          { type: "settings", id: null },
          { changed },
          now,
        );
      return removeLogo ? before.logoStorageKey : null;
    });
    if (previousLogo) await env.storage.delete(previousLogo).catch(() => {});
    return settingsDto(env, env.db);
  });

  app.post("/settings/logo", { config }, async (request) => {
    const ctx = request.ctx;
    const image = await processLogo(
      await readUpload(request, "logo", ctx.t),
      ctx.t,
    );
    const key = env.storage.newKey("logo", LOGO_OWNER, "png");
    await env.storage.put(key, image);
    const previous = await env.db.transaction().execute(async (tx) => {
      const before = await readSettings(tx, { lock: "update" });
      const now = env.clock.now();
      await tx
        .updateTable("gym_settings")
        .set({
          logo_storage_key: key,
          logo_updated_at: now,
          updated_at: now,
          updated_by: ctx.actor?.id ?? null,
        })
        .execute();
      await audit(
        tx,
        ctx,
        "settings.update",
        { type: "settings", id: null },
        { changed: ["logo"] },
        now,
      );
      return before.logoStorageKey;
    });
    if (previous) await env.storage.delete(previous).catch(() => {});
    return settingsDto(env, env.db);
  });

  app.get("/settings/logo", async (request, reply) => {
    const settings = await readSettings(env.db);
    const data = settings.logoStorageKey
      ? await env.storage.get(settings.logoStorageKey)
      : null;
    if (!data) notFound(request.ctx.t);
    return reply
      .header("Content-Type", "image/png")
      .header("Cache-Control", "private, max-age=31536000, immutable")
      .send(data);
  });
}
