#!/usr/bin/env node
/**
 * Vercel build for the web app (which also serves the API):
 *   1. production deployments apply pending database migrations first, so the
 *      new code never runs against an older schema (preview deployments skip
 *      this unless RUN_MIGRATIONS=true, so they can't change production data);
 *   2. build the Next.js app.
 *
 * Migrations use the direct (unpooled) connection: MIGRATION_DATABASE_URL, or
 * DATABASE_URL_UNPOOLED from the Neon integration. Without any database
 * configured the build still succeeds (with a warning); the app then answers
 * 503 until a database is connected and the project is redeployed.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const wantsMigrations = env.VERCEL_ENV === "production" || env.RUN_MIGRATIONS === "true";
const database =
  env.MIGRATION_DATABASE_URL || env.DATABASE_URL_UNPOOLED || env.GYMFLOW_DATABASE_URL || env.DATABASE_URL;

if (!wantsMigrations) {
  console.log(`Skipping database migrations (VERCEL_ENV=${env.VERCEL_ENV ?? "unset"}).`);
} else if (!database) {
  console.warn(
    [
      "",
      "⚠️  No database is connected, so migrations were skipped.",
      "   Connect one (Vercel → Storage → Create → Neon, then connect it to this project),",
      "   set SESSION_SECRET, and redeploy. Until then the app answers 503.",
      "",
    ].join("\n"),
  );
} else {
  run("npx", ["tsx", "src/cli.ts", "migrate"], join(root, "backend"));
}

run("npx", ["next", "build"], join(root, "frontend"));
