/**
 * Staff sessions (backend design §6, §12): an opaque random token lives only
 * in an HttpOnly cookie; the database keeps its SHA-256 digest. Sessions end
 * after a fixed lifetime or an idle period, and on sign-out, password changes
 * and deactivation.
 *
 * CSRF: a readable cookie carries an HMAC of the session token; the web app
 * echoes it in X-CSRF-Token on writes, which a cross-site page cannot do.
 */

import type { FastifyReply } from "fastify";
import type { Env } from "../http/context";
import { hmac, randomToken, tokenDigest } from "../lib/crypto";
import type { Db, Tx } from "../db";

export const CSRF_COOKIE = "gf_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** `__Host-` binds the cookie to this exact host over HTTPS (no Domain, Path=/). */
export function sessionCookieName(env: Env): string {
  return env.config.cookieSecure ? "__Host-gf_session" : "gf_session";
}

export function csrfTokenFor(env: Env, sessionToken: string): string {
  return hmac(env.config.sessionSecret, `csrf:${sessionToken}`);
}

export async function createSession(env: Env, db: Db | Tx, staffId: string) {
  const token = randomToken();
  const now = Date.now();
  const expiresAt = new Date(now + env.config.session.maxHours * 3_600_000);
  await db
    .insertInto("sessions")
    .values({
      token_hash: tokenDigest(token),
      staff_id: staffId,
      created_at: new Date(now),
      last_seen_at: new Date(now),
      expires_at: expiresAt,
    })
    .execute();
  return { token, expiresAt };
}

export function setSessionCookies(
  env: Env,
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  const common = {
    path: "/",
    secure: env.config.cookieSecure,
    sameSite: "lax" as const,
    expires: expiresAt,
  };
  reply.setCookie(sessionCookieName(env), token, { ...common, httpOnly: true });
  reply.setCookie(CSRF_COOKIE, csrfTokenFor(env, token), {
    ...common,
    httpOnly: false,
  });
}

export function clearSessionCookies(env: Env, reply: FastifyReply): void {
  const common = {
    path: "/",
    secure: env.config.cookieSecure,
    sameSite: "lax" as const,
  };
  reply.clearCookie(sessionCookieName(env), { ...common, httpOnly: true });
  reply.clearCookie(CSRF_COOKIE, { ...common, httpOnly: false });
}

/** Ends every session of a staff member, optionally keeping the current one. */
export async function revokeSessions(
  db: Db | Tx,
  staffId: string,
  keepSessionId?: string | null,
): Promise<void> {
  let query = db.deleteFrom("sessions").where("staff_id", "=", staffId);
  if (keepSessionId) query = query.where("id", "!=", keepSessionId);
  await query.execute();
}
