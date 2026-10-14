/**
 * Authentication and own-account endpoints (backend design §9):
 *   POST /auth/login, POST /auth/logout, GET /auth/me,
 *   POST /auth/forgot-password, POST /auth/reset-password,
 *   POST /account/change-password, PATCH /account/preferences
 */

import type { CurrentAccount, Session } from "@gymflow/shared/api/types";
import { PASSWORD_MAX_LENGTH } from "@gymflow/shared/domain/password";
import { ROLE_PERMISSIONS } from "@gymflow/shared/domain/permissions";
import { isLocale } from "@gymflow/shared/i18n/locales";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { actorOf, type Actor, type Env } from "../http/context";
import { parse } from "../http/validation";
import { tokenDigest, randomToken } from "../lib/crypto";
import { fail, FieldErrors, invalid } from "../lib/errors";
import { translator } from "../lib/i18n";
import { isEmail, normalizeEmail } from "../lib/text";
import { audit } from "../services/audit";
import { enqueueEmail } from "../services/mail";
import {
  hashPassword,
  meetsPasswordPolicy,
  verifyDummyPassword,
  verifyPassword,
} from "../services/passwords";
import {
  clearSessionCookies,
  createSession,
  CSRF_COOKIE,
  csrfTokenFor,
  revokeSessions,
  sessionCookieName,
  setSessionCookies,
} from "../services/sessions";
import { hasEnabledPlans, readSettings } from "../services/settings";

const LoginBody = z.strictObject({
  email: z.string().max(1000),
  password: z.string().max(4096),
});
const ForgotBody = z.strictObject({ email: z.string().max(1000) });
const ResetBody = z.strictObject({
  token: z.string().min(1).max(200),
  newPassword: z.string().max(4096),
});
const ChangeBody = z.strictObject({
  currentPassword: z.string().max(4096),
  newPassword: z.string().max(4096),
});
const PreferencesBody = z.strictObject({
  appearance: z.string().optional(),
  language: z.string().optional(),
});

const APPEARANCES = ["LIGHT", "DARK", "SYSTEM"] as const;

export function accountDto(actor: Actor): CurrentAccount {
  return {
    id: actor.id,
    fullName: actor.fullName,
    email: actor.email,
    role: actor.role,
    appearance: actor.appearance,
    language: actor.language,
    mustChangePassword: actor.mustChangePassword,
    permissions: [...actor.permissions],
  };
}

/** The signed-in account plus the gym context every role needs (sidebar, today, methods). */
export async function sessionDto(env: Env, actor: Actor): Promise<Session> {
  const [settings, hasPlans] = await Promise.all([
    readSettings(env.db),
    hasEnabledPlans(env.db),
  ]);
  return {
    account: accountDto(actor),
    gym: {
      name: settings.gymName,
      currency: "ETB",
      timezone: "Africa/Addis_Ababa",
      today: env.clock.today(),
      expirationWarningDays: settings.expirationWarningDays,
      enabledPaymentMethods: settings.enabledPaymentMethods,
      hasPlans,
    },
  };
}

function passwordProblem(password: string): boolean {
  return (
    password.length > PASSWORD_MAX_LENGTH || !meetsPasswordPolicy(password)
  );
}

export async function authRoutes(app: FastifyInstance, env: Env) {
  const authLimit = { max: env.config.login.ratePerMinute, timeWindow: 60_000 };

  app.post(
    "/auth/login",
    { config: { auth: "public", rateLimit: authLimit } },
    async (request, reply) => {
      const { t } = request.ctx;
      const body = parse(LoginBody, request.body, t);
      const email = normalizeEmail(body.email);

      // Brute-force limit per email, kept in the database so it survives restarts.
      const since = new Date(
        Date.now() - env.config.login.windowMinutes * 60_000,
      );
      const failures = await env.db
        .selectFrom("login_failures")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("email", "=", email)
        .where("created_at", ">", since)
        .executeTakeFirstOrThrow();
      if (Number(failures.count) >= env.config.login.maxFailures)
        fail(429, "RATE_LIMITED", t("rateLimited"));

      const staff = isEmail(email)
        ? await env.db
            .selectFrom("staff")
            .selectAll()
            .where("email", "=", email)
            .executeTakeFirst()
        : undefined;
      let valid = false;
      if (staff)
        valid = await verifyPassword(staff.password_hash, body.password);
      else await verifyDummyPassword(body.password);

      if (!staff || !valid) {
        await env.db
          .insertInto("login_failures")
          .values({ email: email.slice(0, 254) })
          .execute();
        fail(401, "INVALID_CREDENTIALS", t("invalidCredentials"));
      }
      if (!staff.is_active) fail(401, "ACCOUNT_DEACTIVATED", t("deactivated"));

      const session = await env.db.transaction().execute(async (tx) => {
        await tx
          .deleteFrom("login_failures")
          .where("email", "=", email)
          .execute();
        await tx
          .updateTable("staff")
          .set({ last_sign_in_at: env.clock.now() })
          .where("id", "=", staff.id)
          .execute();
        return createSession(env, tx, staff.id);
      });
      setSessionCookies(env, reply, session.token, session.expiresAt);

      return sessionDto(env, {
        id: staff.id,
        fullName: staff.full_name,
        email: staff.email,
        role: staff.role,
        appearance: staff.appearance,
        language: staff.language,
        mustChangePassword: staff.must_change_password,
        permissions: ROLE_PERMISSIONS[staff.role],
      });
    },
  );

  app.post(
    "/auth/logout",
    { config: { auth: "public" } },
    async (request, reply) => {
      const token = request.cookies[sessionCookieName(env)];
      if (token)
        await env.db
          .deleteFrom("sessions")
          .where("token_hash", "=", tokenDigest(token))
          .execute();
      clearSessionCookies(env, reply);
      return reply.code(204).send();
    },
  );

  app.get(
    "/auth/me",
    { config: { auth: "password-change" } },
    async (request, reply) => {
      // Re-issue the CSRF cookie if the browser lost it (e.g. cleared site data).
      const token = request.cookies[sessionCookieName(env)];
      if (token && !request.cookies[CSRF_COOKIE]) {
        reply.setCookie(CSRF_COOKIE, csrfTokenFor(env, token), {
          path: "/",
          secure: env.config.cookieSecure,
          sameSite: "lax",
          httpOnly: false,
        });
      }
      return sessionDto(env, actorOf(request.ctx));
    },
  );

  app.post(
    "/auth/forgot-password",
    { config: { auth: "public", rateLimit: authLimit } },
    async (request, reply) => {
      const body = parse(ForgotBody, request.body, request.ctx.t);
      const email = normalizeEmail(body.email);
      const staff = isEmail(email)
        ? await env.db
            .selectFrom("staff")
            .select(["id", "full_name", "email", "language"])
            .where("email", "=", email)
            .where("is_active", "=", true)
            .executeTakeFirst()
        : undefined;

      if (staff) {
        const token = randomToken();
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + env.config.passwordResetMinutes * 60_000,
        );
        const settings = await readSettings(env.db);
        // The email is in the staff member's own language, not the requester's.
        const t = translator(staff.language);
        await env.db.transaction().execute(async (tx) => {
          // Only the newest link works.
          await tx
            .deleteFrom("password_resets")
            .where("staff_id", "=", staff.id)
            .where("consumed_at", "is", null)
            .execute();
          await tx
            .insertInto("password_resets")
            .values({
              token_hash: tokenDigest(token),
              staff_id: staff.id,
              created_at: now,
              expires_at: expiresAt,
            })
            .execute();
          await enqueueEmail(tx, {
            to: staff.email,
            subject: t("resetSubject"),
            text: t("resetBody", {
              name: staff.full_name,
              gym: settings.gymName,
              link: `${env.config.appOrigin}/reset-password?token=${encodeURIComponent(token)}`,
              minutes: env.config.passwordResetMinutes,
            }),
            expiresAt,
          });
        });
      }
      // Same answer whether or not the account exists (backend design §10).
      return reply.code(204).send();
    },
  );

  app.post(
    "/auth/reset-password",
    { config: { auth: "public", rateLimit: authLimit } },
    async (request, reply) => {
      const { t } = request.ctx;
      const body = parse(ResetBody, request.body, t);

      await env.db.transaction().execute(async (tx) => {
        const reset = await tx
          .selectFrom("password_resets")
          .innerJoin("staff", "staff.id", "password_resets.staff_id")
          .select([
            "password_resets.id",
            "password_resets.expires_at",
            "password_resets.consumed_at",
            "staff.id as staff_id",
            "staff.is_active",
          ])
          .where("password_resets.token_hash", "=", tokenDigest(body.token))
          .forUpdate("password_resets")
          .executeTakeFirst();
        if (
          !reset ||
          reset.consumed_at ||
          reset.expires_at.getTime() <= Date.now() ||
          !reset.is_active
        ) {
          fail(400, "INVALID_RESET_TOKEN", t("invalidResetToken"));
        }
        if (passwordProblem(body.newPassword))
          invalid(t, { newPassword: t("passwordPolicy") });

        const passwordHash = await hashPassword(body.newPassword);
        const now = env.clock.now();
        await tx
          .updateTable("staff")
          .set({
            password_hash: passwordHash,
            must_change_password: false,
            updated_at: now,
          })
          .where("id", "=", reset.staff_id)
          .execute();
        await tx
          .updateTable("password_resets")
          .set({ consumed_at: new Date() })
          .where("id", "=", reset.id)
          .execute();
        // Signed-in devices must sign in again with the new password.
        await revokeSessions(tx, reset.staff_id);
        await audit(
          tx,
          request.ctx,
          "staff.password_reset",
          { type: "staff", id: reset.staff_id },
          null,
          now,
        );
      });
      clearSessionCookies(env, reply);
      return reply.code(204).send();
    },
  );
}

export async function accountRoutes(app: FastifyInstance, env: Env) {
  app.post(
    "/account/change-password",
    {
      config: {
        auth: "password-change",
        rateLimit: { max: 10, timeWindow: 60_000 },
      },
    },
    async (request, reply) => {
      const { t } = request.ctx;
      const actor = actorOf(request.ctx);
      const body = parse(ChangeBody, request.body, t);

      const staff = await env.db
        .selectFrom("staff")
        .select("password_hash")
        .where("id", "=", actor.id)
        .executeTakeFirstOrThrow();
      if (!(await verifyPassword(staff.password_hash, body.currentPassword))) {
        fail(422, "INVALID_CURRENT_PASSWORD", t("currentPasswordWrong"), {
          fieldErrors: { currentPassword: t("currentPasswordWrong") },
        });
      }
      const errors = new FieldErrors(t);
      if (passwordProblem(body.newPassword))
        errors.add("newPassword", t("passwordPolicy"));
      else if (body.newPassword === body.currentPassword)
        errors.add("newPassword", t("passwordSame"));
      errors.throwIfAny();

      const passwordHash = await hashPassword(body.newPassword);
      await env.db.transaction().execute(async (tx) => {
        await tx
          .updateTable("staff")
          .set({
            password_hash: passwordHash,
            must_change_password: false,
            updated_at: env.clock.now(),
          })
          .where("id", "=", actor.id)
          .execute();
        // Other devices are signed out; this one stays signed in.
        await revokeSessions(tx, actor.id, request.ctx.sessionId);
      });
      return reply.code(204).send();
    },
  );

  app.patch(
    "/account/preferences",
    { config: { auth: "password-change" } },
    async (request) => {
      const { t } = request.ctx;
      const actor = actorOf(request.ctx);
      const body = parse(PreferencesBody, request.body, t);
      const errors = new FieldErrors(t);
      if (
        body.appearance !== undefined &&
        !(APPEARANCES as readonly string[]).includes(body.appearance)
      ) {
        errors.add("appearance", t("chooseAppearance"));
      }
      if (body.language !== undefined && !isLocale(body.language))
        errors.add("language", t("chooseLanguage"));
      errors.throwIfAny();

      const changes = {
        ...(body.appearance !== undefined
          ? { appearance: body.appearance as Actor["appearance"] }
          : {}),
        ...(body.language !== undefined && isLocale(body.language)
          ? { language: body.language }
          : {}),
      };
      if (Object.keys(changes).length > 0) {
        await env.db
          .updateTable("staff")
          .set({ ...changes, updated_at: env.clock.now() })
          .where("id", "=", actor.id)
          .execute();
      }
      return accountDto({ ...actor, ...changes });
    },
  );
}
