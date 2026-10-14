/**
 * Operations commands (run with `npm run cli -- <command>` or `node dist/cli.js <command>`):
 *
 *   migrate                       apply pending migrations (and app-role grants)
 *   admin:create --email E --name N [--super] [--gym-name G] [--password P] [--language am|en]
 *                                 bootstrap an administrator (there is no public sign-up)
 *   admin:super --email E         make an existing account the super administrator
 *   seed:demo [--reset]           load the demo gym (development and staging only)
 *   db:reset                      drop and recreate the schema (development and tests only)
 */

import { randomInt } from "node:crypto";
import { generateDemoData } from "@gymflow/shared/demo/seed";
import { meetsPasswordPolicy } from "@gymflow/shared/domain/password";
import { isLocale, type Locale } from "@gymflow/shared/i18n/locales";
import { sql } from "kysely";
import { loadConfig, type Config } from "./config";
import { createDb, createPool, type Db } from "./db";
import { grantAppRole, migrate } from "./db/migrate";
import { isEmail, normalizeEmail } from "./lib/text";
import { hashPassword } from "./services/passwords";

type Args = { command: string; flags: Map<string, string | true> };

function parseArgs(argv: string[]): Args {
  const [command = "help", ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) continue;
    const [name, inline] = arg.slice(2).split("=", 2);
    if (inline !== undefined) flags.set(name, inline);
    else if (rest[i + 1] && !rest[i + 1].startsWith("--")) flags.set(name, rest[++i]);
    else flags.set(name, true);
  }
  return { command, flags };
}

function flag(args: Args, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function ownerDb(config: Config) {
  const pool = createPool({
    url: config.database.migrationUrl,
    poolMax: 2,
    ssl: config.database.ssl,
    applicationName: "gymflow-cli",
  });
  return { pool, db: createDb(pool) };
}

/** Readable temporary password that meets the policy (letters, digits, a symbol). */
function temporaryPassword(): string {
  const words = ["Adama", "Lift", "Strong", "Flow", "Power", "Iron", "Fit", "Bole"];
  const symbols = "#!@$%";
  return `${words[randomInt(words.length)]}${words[randomInt(words.length)]}${symbols[randomInt(symbols.length)]}${randomInt(1000, 10000)}`;
}

async function createAdmin(config: Config, args: Args) {
  const email = normalizeEmail(flag(args, "email"));
  const name = flag(args, "name")?.trim();
  const language = flag(args, "language") ?? "am";
  const given = flag(args, "password");
  const superAdmin = args.flags.has("super");
  const gymName = flag(args, "gym-name")?.trim();
  if (!isEmail(email) || !name || !isLocale(language)) {
    throw new Error(
      'Usage: admin:create --email admin@example.com --name "Full Name" [--super] [--gym-name "Gym"] [--password P] [--language am|en]',
    );
  }
  const password = given ?? temporaryPassword();
  if (!meetsPasswordPolicy(password)) {
    throw new Error("The password needs 8+ characters with a letter and a number or symbol.");
  }

  const { pool, db } = ownerDb(config);
  try {
    const existing = await db.selectFrom("staff").select("id").where("email", "=", email).executeTakeFirst();
    if (existing) throw new Error(`A staff account with ${email} already exists (use admin:super to promote it).`);
    const passwordHash = await hashPassword(password);
    await db.transaction().execute(async (tx) => {
      await tx
        .insertInto("staff")
        .values({
          full_name: name,
          email,
          password_hash: passwordHash,
          role: "ADMINISTRATOR",
          is_super_admin: superAdmin,
          must_change_password: true,
          language: language as Locale,
        })
        .execute();
      if (gymName) await tx.updateTable("gym_settings").set({ gym_name: gymName, updated_at: new Date() }).execute();
    });
    console.warn(`${superAdmin ? "Super administrator" : "Administrator"} ${email} created.`);
    if (!given) console.warn(`Temporary password (shown once, change it at first sign-in): ${password}`);
  } finally {
    await pool.end();
  }
}

/** Makes an existing account the super administrator (an active administrator that only its owner can change). */
async function makeSuperAdmin(config: Config, args: Args) {
  const email = normalizeEmail(flag(args, "email"));
  if (!isEmail(email)) throw new Error("Usage: admin:super --email you@example.com");
  const { pool, db } = ownerDb(config);
  try {
    const updated = await db
      .updateTable("staff")
      .set({ role: "ADMINISTRATOR", is_active: true, is_super_admin: true, updated_at: new Date() })
      .where("email", "=", email)
      .returning("id")
      .executeTakeFirst();
    if (!updated) throw new Error(`No staff account with ${email}.`);
    console.warn(`${email} is now the super administrator.`);
  } finally {
    await pool.end();
  }
}

const DATA_TABLES = [
  "stored_files",
  "audit_events",
  "idempotency_keys",
  "payments",
  "memberships",
  "members",
  "plans",
  "email_outbox",
  "login_failures",
  "password_resets",
  "sessions",
  "staff",
] as const;

async function chunked<T>(rows: T[], size: number, insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

export async function seedDemo(db: Db, options: { reset: boolean }): Promise<void> {
  const data = generateDemoData();
  await db.transaction().execute(async (tx) => {
    if (options.reset) {
      await sql`TRUNCATE ${sql.join(DATA_TABLES.map((t) => sql.table(t)))} RESTART IDENTITY CASCADE`.execute(tx);
    } else {
      const existing = await tx.selectFrom("members").select("id").limit(1).executeTakeFirst();
      const staff = await tx.selectFrom("staff").select("id").limit(1).executeTakeFirst();
      if (existing || staff) throw new Error("The database already has data. Use seed:demo --reset to replace it.");
    }

    const hashes = new Map<string, string>();
    for (const password of new Set(data.staff.map((s) => s.password)))
      hashes.set(password, await hashPassword(password));
    await tx
      .insertInto("staff")
      .values(
        data.staff.map((s) => ({
          id: s.id,
          full_name: s.fullName,
          email: s.email,
          password_hash: hashes.get(s.password)!,
          role: s.role,
          is_active: s.isActive,
          must_change_password: s.mustChangePassword,
          is_super_admin: s.isSuperAdmin,
          appearance: s.appearance,
          language: s.language,
          last_sign_in_at: s.lastSignInAt,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
        })),
      )
      .execute();
    await tx
      .insertInto("plans")
      .values(
        data.plans.map((p) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          duration_days: p.durationDays,
          description: p.description,
          is_enabled: p.isEnabled,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        })),
      )
      .execute();
    await chunked(data.members, 500, (rows) =>
      tx
        .insertInto("members")
        .values(
          rows.map((m) => ({
            id: m.id,
            member_code: m.memberCode,
            first_name: m.firstName,
            last_name: m.lastName,
            phone: m.phone,
            email: m.email,
            gender: m.gender,
            emergency_name: m.emergencyName,
            emergency_phone: m.emergencyPhone,
            emergency_relationship: m.emergencyRelationship,
            address: m.address,
            notes: m.notes,
            is_archived: m.isArchived,
            archived_at: m.archivedAt,
            registration_date: m.registrationDate,
            created_at: m.createdAt,
            updated_at: m.updatedAt,
          })),
        )
        .execute(),
    );
    await chunked(data.memberships, 500, (rows) =>
      tx
        .insertInto("memberships")
        .values(
          rows.map((m) => ({
            id: m.id,
            member_id: m.memberId,
            plan_id: m.planId,
            plan_name_snapshot: m.planNameSnapshot,
            price_snapshot: m.priceSnapshot,
            duration_days_snapshot: m.durationDaysSnapshot,
            start_date: m.startDate,
            end_date: m.endDate,
            is_renewal: m.isRenewal,
            created_at: m.createdAt,
          })),
        )
        .execute(),
    );
    await chunked(data.payments, 500, (rows) =>
      tx
        .insertInto("payments")
        .values(
          rows.map((p) => ({
            id: p.id,
            payment_code: p.paymentCode,
            member_id: p.memberId,
            membership_id: p.membershipId,
            amount: p.amount,
            method: p.method,
            received_date: p.receivedDate,
            reference: p.reference,
            notes: p.notes,
            recorded_by: p.recordedBy,
            created_at: p.createdAt,
          })),
        )
        .execute(),
    );
    // Upsert: the singleton row may have been emptied by TRUNCATE … CASCADE (it references staff).
    const settings = {
      gym_name: data.settings.gymName,
      phone: data.settings.phone,
      email: data.settings.email,
      address: data.settings.address,
      logo_storage_key: null,
      logo_updated_at: null,
      expiration_warning_days: data.settings.expirationWarningDays,
      enabled_payment_methods: data.settings.enabledPaymentMethods,
      updated_at: data.settings.updatedAt,
      updated_by: data.settings.updatedBy,
    };
    await tx
      .insertInto("gym_settings")
      .values({ id: true, ...settings })
      .onConflict((oc) => oc.column("id").doUpdateSet(settings))
      .execute();
    // New codes continue after the demo's highest numbers.
    await sql`SELECT setval('member_number_seq', ${data.counters.member})`.execute(tx);
    await sql`SELECT setval('payment_number_seq', ${data.counters.payment})`.execute(tx);
  });
}

export async function resetSchema(db: Db): Promise<void> {
  await sql`DROP SCHEMA public CASCADE`.execute(db);
  await sql`CREATE SCHEMA public`.execute(db);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const log = (message: string) => console.warn(message);

  switch (args.command) {
    case "migrate": {
      const { pool } = ownerDb(config);
      try {
        const result = await migrate(pool, {
          appRole: config.database.appRole,
          log,
        });
        log(
          result.applied.length ? `Applied: ${result.applied.join(", ")}` : `Schema is up to date (${result.current}).`,
        );
      } finally {
        await pool.end();
      }
      return;
    }
    case "admin:create":
      return createAdmin(config, args);
    case "admin:super":
      return makeSuperAdmin(config, args);
    case "seed:demo": {
      if (config.isProduction) throw new Error("seed:demo is not available in production.");
      const { pool, db } = ownerDb(config);
      try {
        await seedDemo(db, { reset: args.flags.has("reset") });
        log("Demo data loaded: Adama Fitness, 356 members, staff password GymFlow#2026.");
      } finally {
        await pool.end();
      }
      return;
    }
    case "db:reset": {
      if (config.isProduction) throw new Error("db:reset is not available in production.");
      const { pool, db } = ownerDb(config);
      try {
        await resetSchema(db);
        await migrate(pool, { appRole: config.database.appRole, log });
        log("Schema recreated.");
      } finally {
        await pool.end();
      }
      return;
    }
    case "grant": {
      if (!config.database.appRole) throw new Error("Set DATABASE_APP_ROLE.");
      const { pool } = ownerDb(config);
      try {
        await grantAppRole(pool, config.database.appRole);
      } finally {
        await pool.end();
      }
      return;
    }
    default:
      console.warn(
        "Commands: migrate | admin:create --email E --name N [--super] | admin:super --email E | seed:demo [--reset] | db:reset | grant",
      );
      process.exitCode = args.command === "help" ? 0 : 1;
  }
}

if (process.argv[1] && /cli\.(ts|js)$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
