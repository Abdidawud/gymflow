/** Recreates the test database schema once per test run. */

import { resetSchema } from "../src/cli";
import { createDb, createPool } from "../src/db";
import { migrate } from "../src/db/migrate";
import { loadTestEnv } from "./env";

export default async function setup() {
  const { ownerUrl, appRole } = loadTestEnv();
  const pool = createPool({ url: ownerUrl, poolMax: 2 });
  const db = createDb(pool);
  try {
    await resetSchema(db);
    await migrate(pool, { appRole: appRole ?? null });
  } finally {
    await db.destroy();
  }
}
