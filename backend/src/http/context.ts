/**
 * Per-request state and dependencies. Route handlers receive the request's
 * language, the signed-in staff member (when the route requires one) and the
 * shared services; nothing is read from globals.
 */

import type { Permission, Role } from "@gymflow/shared/domain/permissions";
import type { Appearance } from "@gymflow/shared/api/types";
import type { Locale } from "@gymflow/shared/i18n/locales";
import type { FastifyBaseLogger } from "fastify";
import type pg from "pg";
import type { Config } from "../config";
import type { Db } from "../db";
import type { Clock } from "../lib/clock";
import type { Translate } from "../lib/i18n";
import type { MailTransport } from "../services/mail";
import type { FileStorage } from "../services/storage";

/** Long-lived dependencies, created once at startup. */
export interface Env {
  config: Config;
  db: Db;
  pool: pg.Pool;
  clock: Clock;
  storage: FileStorage;
  mail: MailTransport;
  /**
   * Runs work after the response is sent (e.g. delivering a queued email).
   * The standalone server runs it in the background; on Vercel it uses
   * waitUntil so the function stays alive until it finishes.
   */
  defer: (task: () => Promise<unknown>) => void;
  log: FastifyBaseLogger;
}

export interface Actor {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  appearance: Appearance;
  language: Locale;
  mustChangePassword: boolean;
  isSuperAdmin: boolean;
  permissions: readonly Permission[];
}

export interface RequestContext {
  requestId: string;
  locale: Locale;
  t: Translate;
  /** Set on routes that require a session. */
  actor: Actor | null;
  sessionId: string | null;
  /** Remote address as seen through the trusted proxy. */
  ip: string;
  /** Runs work after this request's response is sent (see Env.defer). */
  defer: (task: () => Promise<unknown>) => void;
}

/**
 * "public": no session; "session": signed in with a usable account;
 * "password-change": signed in, even while a temporary password must be changed.
 */
export type AuthMode = "public" | "session" | "password-change";

declare module "fastify" {
  interface FastifyRequest {
    ctx: RequestContext;
  }
  interface FastifyContextConfig {
    auth?: AuthMode;
    permission?: Permission;
  }
}

/** The signed-in staff member of a route that requires one. */
export function actorOf(ctx: RequestContext): Actor {
  if (!ctx.actor) throw new Error("Route requires an authenticated actor but none was set.");
  return ctx.actor;
}

export function can(ctx: RequestContext, permission: Permission): boolean {
  return ctx.actor?.permissions.includes(permission) ?? false;
}
