import { existsSync } from "node:fs";
import { resolve } from "node:path";

/** Loads backend/.env.test (CI sets the variables directly instead). */
export function loadTestEnv(): {
  appUrl: string;
  ownerUrl: string;
  appRole: string | undefined;
} {
  const file = resolve(import.meta.dirname, "../.env.test");
  if (existsSync(file)) process.loadEnvFile(file);
  const appUrl = process.env.TEST_DATABASE_URL;
  const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? appUrl;
  if (!appUrl || !ownerUrl) {
    throw new Error(
      "Set TEST_DATABASE_URL (see backend/.env.test.example) to run the integration tests.",
    );
  }
  if (!/test/i.test(new URL(ownerUrl).pathname)) {
    throw new Error(
      "Refusing to run: the test database name must contain 'test' (its schema is dropped).",
    );
  }
  return { appUrl, ownerUrl, appRole: process.env.DATABASE_APP_ROLE };
}
