#!/usr/bin/env node
/**
 * Vercel build for the web app (which also serves the API):
 *   1. production deployments apply pending database migrations first, so the
 *      new code never runs against an older schema (preview deployments skip
 *      this unless RUN_MIGRATIONS=true, so they can't change production data);
 *   2. build the Next.js app.
 * Migrations use the direct (unpooled) connection: MIGRATION_DATABASE_URL, or
 * DATABASE_URL_UNPOOLED from the Neon integration.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, cwd) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const production = process.env.VERCEL_ENV === "production" || process.env.RUN_MIGRATIONS === "true";
if (production) {
  if (!process.env.MIGRATION_DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED && !process.env.DATABASE_URL) {
    console.error("No database configured: set DATABASE_URL (and MIGRATION_DATABASE_URL or DATABASE_URL_UNPOOLED).");
    process.exit(1);
  }
  run("npx", ["tsx", "src/cli.ts", "migrate"], join(root, "backend"));
} else {
  console.log(`Skipping database migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}).`);
}

run("npx", ["next", "build"], join(root, "frontend"));
