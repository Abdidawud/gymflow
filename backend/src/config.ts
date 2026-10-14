/**
 * Runtime configuration from environment variables, validated at startup.
 * Unsafe combinations (development shortcuts in production) stop the process
 * instead of starting a misconfigured server.
 */

import { isDateOnly, type DateOnly } from "@gymflow/shared/domain/dates";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", "yes", "no"])
  .transform((value) => value === "true" || value === "1" || value === "yes");

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  /** Connection used by the running API: the least-privileged application role. */
  DATABASE_URL: z.string().min(1),
  /** Schema owner used for migrations; defaults to DATABASE_URL. */
  MIGRATION_DATABASE_URL: z.string().optional(),
  /** Application role that migrations grant data privileges to (e.g. gymflow_app). */
  DATABASE_APP_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_SSL: bool.default(false),

  /** Public origin of the web app, used for reset links and the origin check. */
  APP_ORIGIN: z.url(),
  /** Extra allowed origins (comma-separated), for a frontend on another origin. */
  ALLOWED_ORIGINS: z.string().default(""),
  /** Path the browser uses to reach the API (photo and logo URLs). */
  PUBLIC_API_PATH: z.string().default("/api/v1"),
  /** Secret for CSRF tokens; at least 32 characters. */
  SESSION_SECRET: z.string().min(32),
  COOKIE_SECURE: bool.optional(),
  /** Fastify trustProxy: "true", "false", a hop count or a list of trusted addresses. */
  TRUST_PROXY: z.string().default("loopback"),

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
  MAIL_TRANSPORT: z.enum(["smtp", "log", "disabled"]).default("log"),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default("GymFlow <no-reply@localhost>"),

  /** Private storage for member photos and the gym logo. */
  STORAGE_DIR: z.string().default("./var/storage"),

  /** Development/test only: freeze "today" (YYYY-MM-DD) in the gym timezone. */
  FIXED_TODAY: z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value === "" || isDateOnly(value),
      "FIXED_TODAY must be YYYY-MM-DD",
    ),
});

export interface Config {
  env: "development" | "test" | "production";
  isProduction: boolean;
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
  session: { maxHours: number; idleMinutes: number };
  passwordResetMinutes: number;
  login: { maxFailures: number; windowMinutes: number; ratePerMinute: number };
  mail: {
    transport: "smtp" | "log" | "disabled";
    smtpUrl: string | null;
    from: string;
  };
  storageDir: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === "production";
  const appOrigin = new URL(e.APP_ORIGIN).origin;
  const fixedToday = e.FIXED_TODAY ? e.FIXED_TODAY : null;

  const config: Config = {
    env: e.NODE_ENV,
    isProduction,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    database: {
      url: e.DATABASE_URL,
      migrationUrl: e.MIGRATION_DATABASE_URL || e.DATABASE_URL,
      appRole: e.DATABASE_APP_ROLE ?? null,
      poolMax: e.DATABASE_POOL_MAX,
      ssl: e.DATABASE_SSL,
    },
    appOrigin,
    allowedOrigins: [
      appOrigin,
      ...e.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => new URL(origin).origin),
    ],
    publicApiPath: e.PUBLIC_API_PATH.replace(/\/$/, ""),
    sessionSecret: e.SESSION_SECRET,
    cookieSecure: e.COOKIE_SECURE ?? isProduction,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    session: {
      maxHours: e.SESSION_MAX_HOURS,
      idleMinutes: e.SESSION_IDLE_MINUTES,
    },
    passwordResetMinutes: e.PASSWORD_RESET_MINUTES,
    login: {
      maxFailures: e.LOGIN_MAX_FAILURES,
      windowMinutes: e.LOGIN_WINDOW_MINUTES,
      ratePerMinute: e.AUTH_RATE_LIMIT_PER_MINUTE,
    },
    mail: {
      transport: e.MAIL_TRANSPORT,
      smtpUrl: e.SMTP_URL ?? null,
      from: e.MAIL_FROM,
    },
    storageDir: e.STORAGE_DIR,
    fixedToday,
  };

  if (isProduction) {
    const problems: string[] = [];
    if (fixedToday)
      problems.push("FIXED_TODAY is for development and tests only.");
    if (config.mail.transport === "log")
      problems.push("MAIL_TRANSPORT=log would write reset links to the logs.");
    if (!config.cookieSecure)
      problems.push("COOKIE_SECURE must be true (HTTPS) in production.");
    if (!appOrigin.startsWith("https://"))
      problems.push("APP_ORIGIN must use https:// in production.");
    if (problems.length > 0)
      throw new Error(
        `Unsafe production configuration:\n  ${problems.join("\n  ")}`,
      );
  }
  if (config.mail.transport === "smtp" && !config.mail.smtpUrl) {
    throw new Error(
      "Invalid configuration:\n  SMTP_URL is required when MAIL_TRANSPORT=smtp.",
    );
  }
  return config;
}
