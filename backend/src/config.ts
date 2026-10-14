/**
 * Runtime configuration from environment variables, validated at startup.
 * Unsafe combinations (development shortcuts in production) stop the process
 * instead of starting a misconfigured server.
 *
 * Works the same as a standalone server and inside the web app on Vercel,
 * where the production URL, preview URLs and Neon's pooled/direct database
 * URLs are picked up from Vercel's own variables.
 */

import { isDateOnly, type DateOnly } from "@gymflow/shared/domain/dates";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((value) => value === "true" || value === "1" || value === "yes");

const ENVIRONMENTS = ["development", "test", "production"] as const;

const schema = z.object({
  NODE_ENV: z.string().optional(),
  /** Overrides NODE_ENV for the API (e.g. "test" under `next start`, which forces NODE_ENV=production). */
  APP_ENV: z.enum(ENVIRONMENTS).optional(),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  /** Connection used by the running API: the least-privileged role; on Neon, the pooled URL. */
  DATABASE_URL: z.string().min(1).optional(),
  /** Takes precedence over DATABASE_URL (when an integration manages DATABASE_URL). */
  GYMFLOW_DATABASE_URL: z.string().min(1).optional(),
  /** Schema owner for migrations (a direct, unpooled connection). */
  MIGRATION_DATABASE_URL: z.string().optional(),
  /** Neon's direct connection, set by the Vercel integration; used for migrations when present. */
  DATABASE_URL_UNPOOLED: z.string().optional(),
  /** Application role that migrations grant data privileges to (e.g. gymflow_app). */
  DATABASE_APP_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
  DATABASE_SSL: bool.default(false),

  /** Public origin of the web app: origin checks and password-reset links. */
  APP_ORIGIN: z.url().optional(),
  /** Extra allowed origins (comma-separated), for a web app on another origin than the API. */
  ALLOWED_ORIGINS: z.string().default(""),
  /** Path the browser uses to reach the API (photo and logo URLs). */
  PUBLIC_API_PATH: z.string().default("/api/v1"),
  /** Secret for CSRF tokens; at least 32 characters. */
  SESSION_SECRET: z.string().min(32),
  COOKIE_SECURE: bool.optional(),
  /** Fastify trustProxy for the standalone server: "true", "false", a hop count or trusted addresses. */
  TRUST_PROXY: z.string().default("loopback"),
  /** Shared secret Vercel Cron sends as "Authorization: Bearer …" to /api/v1/internal/cron. */
  CRON_SECRET: z.string().min(16).optional(),

  SESSION_MAX_HOURS: z.coerce.number().min(1).max(72).default(12),
  SESSION_IDLE_MINUTES: z.coerce
    .number()
    .min(5)
    .max(24 * 60)
    .default(30),
  PASSWORD_RESET_MINUTES: z.coerce
    .number()
    .min(5)
    .max(24 * 60)
    .default(30),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(3).max(100).default(5),
  LOGIN_WINDOW_MINUTES: z.coerce
    .number()
    .min(1)
    .max(24 * 60)
    .default(10),
  /** Per-IP limit for sign-in and password-recovery requests per minute. */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),

  /** "smtp" sends email; "log" prints it (development only); "disabled" drops it. */
  MAIL_TRANSPORT: z.enum(["smtp", "log", "disabled"]).optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("GymFlow <no-reply@localhost>"),

  /** Development/test only: freeze "today" (YYYY-MM-DD) in the gym timezone. */
  FIXED_TODAY: z
    .string()
    .optional()
    .refine((value) => value === undefined || value === "" || isDateOnly(value), "FIXED_TODAY must be YYYY-MM-DD"),

  // Set by Vercel.
  VERCEL: z.string().optional(),
  VERCEL_ENV: z.string().optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

export interface Config {
  env: (typeof ENVIRONMENTS)[number];
  isProduction: boolean;
  /** Running inside a Vercel Function (no long-lived process, no persistent disk). */
  onVercel: boolean;
  host: string;
  port: number;
  logLevel: string;
  database: {
    url: string;
    migrationUrl: string;
    appRole: string | null;
    poolMax: number;
    ssl: boolean;
  };
  appOrigin: string;
  allowedOrigins: string[];
  publicApiPath: string;
  sessionSecret: string;
  cookieSecure: boolean;
  /** Fastify trustProxy: true/false, trusted addresses, or a function trusting the first N hops. */
  trustProxy: boolean | string | ((address: string, hop: number) => boolean);
  cronSecret: string | null;
  session: { maxHours: number; idleMinutes: number };
  passwordResetMinutes: number;
  login: { maxFailures: number; windowMinutes: number; ratePerMinute: number };
  mail: { transport: "smtp" | "log" | "disabled"; smtpUrl: string | null; from: string };
  fixedToday: DateOnly | null;
}

function parseTrustProxy(value: string): Config["trustProxy"] {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    return (_address, hop) => hop < hops;
  }
  return value;
}

const https = (host: string | undefined) => (host ? `https://${host.replace(/^https?:\/\//, "")}` : null);

function resolveEnvironment(env: NodeJS.ProcessEnv): Config["env"] {
  const appEnv = env.APP_ENV;
  if (appEnv && (ENVIRONMENTS as readonly string[]).includes(appEnv)) return appEnv as Config["env"];
  const nodeEnv = env.NODE_ENV ?? "";
  return (ENVIRONMENTS as readonly string[]).includes(nodeEnv) ? (nodeEnv as Config["env"]) : "development";
}

export interface DatabaseConfig {
  env: Config["env"];
  isProduction: boolean;
  database: Config["database"];
}

/**
 * Just the database settings, for the CLI (migrations, creating the super
 * administrator): it doesn't need the web app's secrets or origin.
 */
export function loadDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  const url = env.GYMFLOW_DATABASE_URL || env.DATABASE_URL;
  const migrationUrl = env.MIGRATION_DATABASE_URL || env.DATABASE_URL_UNPOOLED || url;
  if (!migrationUrl) {
    throw new Error("Set DATABASE_URL (or MIGRATION_DATABASE_URL / DATABASE_URL_UNPOOLED) to the database.");
  }
  const appRole = env.DATABASE_APP_ROLE || null;
  if (appRole && !/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error(`Invalid DATABASE_APP_ROLE: ${appRole}`);
  const environment = resolveEnvironment(env);
  return {
    env: environment,
    isProduction: environment === "production",
    database: {
      url: url ?? migrationUrl,
      migrationUrl,
      appRole,
      poolMax: 2,
      ssl: ["true", "1", "yes"].includes(env.DATABASE_SSL ?? ""),
    },
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const e = parsed.data;
  const databaseUrl = e.GYMFLOW_DATABASE_URL ?? e.DATABASE_URL;
  if (!databaseUrl) throw new Error("Invalid configuration:\n  DATABASE_URL is required.");
  const appEnv = resolveEnvironment(env);
  const isProduction = appEnv === "production";
  const onVercel = e.VERCEL === "1";

  const origin = e.APP_ORIGIN ?? https(e.VERCEL_PROJECT_PRODUCTION_URL);
  if (!origin) throw new Error("Invalid configuration:\n  APP_ORIGIN is required (the web app's public URL).");
  const appOrigin = new URL(origin).origin;
  const fixedToday = e.FIXED_TODAY ? e.FIXED_TODAY : null;
  const extraOrigins = e.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);
  // Each Vercel deployment and branch has its own URL; requests from it are same-origin.
  const vercelOrigins = [https(e.VERCEL_URL), https(e.VERCEL_BRANCH_URL)].filter((value): value is string =>
    Boolean(value),
  );

  const config: Config = {
    env: appEnv,
    isProduction,
    onVercel,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    database: {
      url: databaseUrl,
      migrationUrl: e.MIGRATION_DATABASE_URL || e.DATABASE_URL_UNPOOLED || databaseUrl,
      appRole: e.DATABASE_APP_ROLE ?? null,
      // Serverless instances each keep a small pool in front of the database pooler.
      poolMax: e.DATABASE_POOL_MAX ?? (onVercel ? 5 : 10),
      ssl: e.DATABASE_SSL,
    },
    appOrigin,
    allowedOrigins: [...new Set([appOrigin, ...extraOrigins, ...vercelOrigins])],
    publicApiPath: e.PUBLIC_API_PATH.replace(/\/$/, ""),
    sessionSecret: e.SESSION_SECRET,
    cookieSecure: e.COOKIE_SECURE ?? isProduction,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    cronSecret: e.CRON_SECRET ?? null,
    session: { maxHours: e.SESSION_MAX_HOURS, idleMinutes: e.SESSION_IDLE_MINUTES },
    passwordResetMinutes: e.PASSWORD_RESET_MINUTES,
    login: {
      maxFailures: e.LOGIN_MAX_FAILURES,
      windowMinutes: e.LOGIN_WINDOW_MINUTES,
      ratePerMinute: e.AUTH_RATE_LIMIT_PER_MINUTE,
    },
    mail: {
      transport: e.MAIL_TRANSPORT ?? (e.SMTP_URL ? "smtp" : isProduction ? "disabled" : "log"),
      smtpUrl: e.SMTP_URL ?? null,
      from: e.MAIL_FROM,
    },
    fixedToday,
  };

  if (isProduction) {
    const problems: string[] = [];
    if (fixedToday) problems.push("FIXED_TODAY is for development and tests only.");
    if (config.mail.transport === "log") problems.push("MAIL_TRANSPORT=log would write reset links to the logs.");
    if (!config.cookieSecure) problems.push("COOKIE_SECURE must be true (HTTPS) in production.");
    if (!appOrigin.startsWith("https://")) problems.push("APP_ORIGIN must use https:// in production.");
    if (problems.length > 0) throw new Error(`Unsafe production configuration:\n  ${problems.join("\n  ")}`);
  }
  if (config.mail.transport === "smtp" && !config.mail.smtpUrl) {
    throw new Error("Invalid configuration:\n  SMTP_URL is required when MAIL_TRANSPORT=smtp.");
  }
  return config;
}
