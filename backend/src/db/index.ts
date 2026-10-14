/**
 * PostgreSQL connection pool and the typed query builder.
 */

import { Kysely, PostgresDialect, type Transaction } from "kysely";
import pg from "pg";
import type { Database } from "./schema";

// Keep `date` as the exact ISO calendar date: node-postgres would otherwise turn
// it into a local-time Date and shift it by the server's timezone offset.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);
// Money stays a decimal string ("1500.00"); never a binary float.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => value);
// COUNT(*) and identity columns are bigint; counts here always fit in a number.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => value);

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

export interface DatabaseOptions {
  url: string;
  poolMax?: number;
  ssl?: boolean;
  applicationName?: string;
}

/**
 * A connection pool that also works behind a transaction pooler (Neon's
 * PgBouncer): no per-session SET commands or startup options, and only
 * transaction-scoped advisory locks at runtime. Timestamps are absolute
 * (timestamptz) and gym-local dates are computed explicitly, so the session
 * timezone never matters. Statement timeouts are set on the database role
 * (see grantAppRole).
 */
export function createPool({ url, poolMax = 10, ssl = false, applicationName = "gymflow-api" }: DatabaseOptions) {
  const pool = new pg.Pool({
    connectionString: url,
    max: poolMax,
    ...(ssl ? { ssl: { rejectUnauthorized: true } } : {}),
    application_name: applicationName,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // An idle connection dropped by the server must not crash the process.
  pool.on("error", (error) => {
    console.error("[db] idle client error:", error.message);
  });
  return pool;
}

export function createDb(pool: pg.Pool): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
}

/** PostgreSQL error with its SQLSTATE and constraint, when present. */
export interface PgError extends Error {
  code?: string;
  constraint?: string;
}

export function isPgError(error: unknown, code?: string): error is PgError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as PgError).code === "string" &&
    (code === undefined || (error as PgError).code === code)
  );
}

export const PG = {
  UNIQUE_VIOLATION: "23505",
  EXCLUSION_VIOLATION: "23P01",
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
  RESTRICT_VIOLATION: "23001",
} as const;
