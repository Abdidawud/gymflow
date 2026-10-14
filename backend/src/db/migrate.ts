/**
 * Versioned SQL migrations (backend design §13): files in /migrations run in
 * order, each in its own transaction, under an advisory lock so two deploys
 * can't migrate at once. Applied files are checksummed; editing one after it
 * ran is an error, so changes always go in a new migration.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

/** Stable advisory lock key for GymFlow migrations. */
const LOCK_ID = 730_122_019;

export function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  // src/db → ../../migrations when run from source; dist → ../migrations when bundled.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../migrations"),
    resolve(here, "../migrations"),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0];
}

interface MigrationFile {
  version: string;
  sql: string;
  checksum: string;
}

async function readMigrations(dir: string): Promise<MigrationFile[]> {
  const files = (await readdir(dir))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(join(dir, name), "utf8");
      return {
        version: name.replace(/\.sql$/, ""),
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

export interface MigrateResult {
  applied: string[];
  current: string | null;
}

export async function migrate(
  pool: pg.Pool,
  options: {
    dir?: string;
    appRole?: string | null;
    log?: (message: string) => void;
  } = {},
): Promise<MigrateResult> {
  const log = options.log ?? (() => {});
  const migrations = await readMigrations(options.dir ?? (await resolveDir()));
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    );
    const done = new Map(rows.map((row) => [row.version, row.checksum]));
    for (const [version, checksum] of done) {
      const file = migrations.find((m) => m.version === version);
      if (!file)
        throw new Error(
          `Migration ${version} was applied but its file is missing.`,
        );
      if (file.checksum !== checksum) {
        throw new Error(
          `Migration ${version} changed after it was applied. Add a new migration instead.`,
        );
      }
    }

    const applied: string[] = [];
    for (const migration of migrations) {
      if (done.has(migration.version)) continue;
      log(`Applying migration ${migration.version}…`);
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.version, migration.checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(
          `Migration ${migration.version} failed: ${(error as Error).message}`,
          { cause: error },
        );
      }
      applied.push(migration.version);
    }

    if (options.appRole) await grantAppRole(client, options.appRole);
    return { applied, current: migrations.at(-1)?.version ?? null };
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [LOCK_ID])
      .catch(() => {});
    client.release();
  }
}

async function resolveDir(): Promise<string> {
  const dir = migrationsDir();
  if (!existsSync(dir))
    throw new Error(
      `Migrations directory not found: ${dir} (set MIGRATIONS_DIR).`,
    );
  return dir;
}

/**
 * Least privilege for the running API (backend design §12): it can read and
 * write operational data, but can only INSERT financial history and audit
 * events, never UPDATE or DELETE them.
 */
export async function grantAppRole(
  client: pg.PoolClient | pg.Pool,
  role: string,
): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(role))
    throw new Error(`Invalid role name: ${role}`);
  const statements = [
    `GRANT USAGE ON SCHEMA public TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE ON staff, members, plans TO ${role}`,
    `GRANT SELECT, UPDATE ON gym_settings TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, password_resets, email_outbox TO ${role}`,
    `GRANT SELECT, INSERT, DELETE ON login_failures TO ${role}`,
    `GRANT SELECT, INSERT ON memberships, payments, audit_events TO ${role}`,
    `GRANT SELECT, INSERT, UPDATE ON idempotency_keys TO ${role}`,
    `GRANT SELECT ON schema_migrations TO ${role}`,
    `GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
    `REVOKE UPDATE, DELETE, TRUNCATE ON memberships, payments, audit_events FROM ${role}`,
  ];
  for (const statement of statements) await client.query(statement);
}

/** Latest migration file version, for the readiness check. */
export async function latestMigrationVersion(
  dir?: string,
): Promise<string | null> {
  const migrations = await readMigrations(dir ?? (await resolveDir()));
  return migrations.at(-1)?.version ?? null;
}
