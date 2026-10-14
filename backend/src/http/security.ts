/**
 * Access control for every request (backend design §3, §8, §12):
 *   1. writes must come from an allowed origin (no cross-site requests);
 *   2. routes require a valid session unless marked public — denied by default;
 *   3. session writes must echo the CSRF token;
 *   4. accounts with a temporary password can only change it;
 *   5. administrator-only routes check the role's permissions.
 */

import { ROLE_PERMISSIONS } from "@gymflow/shared/domain/permissions";
import type { FastifyReply, FastifyRequest } from "fastify";
import { safeEqual, tokenDigest } from "../lib/crypto";
import { fail } from "../lib/errors";
import { clearSessionCookies, CSRF_HEADER, csrfTokenFor, sessionCookieName } from "../services/sessions";
import type { Env } from "./context";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOUCH_INTERVAL_MS = 60_000;

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method);
}

export function checkOrigin(env: Env, request: FastifyRequest): void {
  if (isSafeMethod(request.method)) return;
  const { t } = request.ctx;
  const origin = request.headers.origin;
  if (origin) {
    if (!env.config.allowedOrigins.includes(origin)) fail(403, "FORBIDDEN", t("originForbidden"));
    return;
  }
  // No Origin header (older browsers, server-to-server): reject only known cross-site requests.
  if (request.headers["sec-fetch-site"] === "cross-site") fail(403, "FORBIDDEN", t("originForbidden"));
}

export async function authenticate(env: Env, request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { t } = request.ctx;
  const mode = request.routeOptions.config.auth ?? "session";
  const token = request.cookies[sessionCookieName(env)];
  if (!token) fail(401, "UNAUTHENTICATED", t("unauthenticated"));

  const row = await env.db
    .selectFrom("sessions")
    .innerJoin("staff", "staff.id", "sessions.staff_id")
    .select([
      "sessions.id as session_id",
      "sessions.expires_at",
      "sessions.last_seen_at",
      "staff.id",
      "staff.full_name",
      "staff.email",
      "staff.role",
      "staff.is_active",
      "staff.must_change_password",
      "staff.is_super_admin",
      "staff.appearance",
      "staff.language",
    ])
    .where("sessions.token_hash", "=", tokenDigest(token))
    .executeTakeFirst();

  if (!row) {
    clearSessionCookies(env, reply);
    fail(401, "SESSION_EXPIRED", t("sessionExpired"));
  }

  const now = Date.now();
  const idleLimit = env.config.session.idleMinutes * 60_000;
  if (row.expires_at.getTime() <= now || now - row.last_seen_at.getTime() >= idleLimit) {
    await env.db.deleteFrom("sessions").where("id", "=", row.session_id).execute();
    clearSessionCookies(env, reply);
    fail(401, "SESSION_EXPIRED", t("sessionExpired"));
  }
  if (!row.is_active) {
    await env.db.deleteFrom("sessions").where("staff_id", "=", row.id).execute();
    clearSessionCookies(env, reply);
    fail(401, "ACCOUNT_DEACTIVATED", t("deactivated"));
  }
  if (!isSafeMethod(request.method)) {
    const sent = request.headers[CSRF_HEADER];
    if (typeof sent !== "string" || !safeEqual(sent, csrfTokenFor(env, token))) {
      fail(403, "FORBIDDEN", t("csrf"));
    }
  }
  if (row.must_change_password && mode !== "password-change") {
    fail(403, "PASSWORD_CHANGE_REQUIRED", t("passwordChangeRequired"));
  }

  if (now - row.last_seen_at.getTime() > TOUCH_INTERVAL_MS) {
    await env.db
      .updateTable("sessions")
      .set({ last_seen_at: new Date(now) })
      .where("id", "=", row.session_id)
      .execute();
  }

  const permissions = ROLE_PERMISSIONS[row.role];
  request.ctx.actor = {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    appearance: row.appearance,
    language: row.language,
    mustChangePassword: row.must_change_password,
    isSuperAdmin: row.is_super_admin,
    permissions,
  };
  request.ctx.sessionId = row.session_id;

  const required = request.routeOptions.config.permission;
  if (required && !permissions.includes(required)) fail(403, "FORBIDDEN", t("forbidden"));
}
