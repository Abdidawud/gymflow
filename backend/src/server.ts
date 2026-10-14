/**
 * Production entry point: validate configuration, check the database schema,
 * serve the API and run background jobs; shut down gracefully on SIGTERM
 * (stop accepting requests, finish in-flight ones, close the pool).
 */

import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb, createPool } from "./db";
import { createClock } from "./lib/clock";
import { startBackgroundJobs } from "./services/jobs";
import { createMailTransport } from "./services/mail";
import { FileStorage } from "./services/storage";

async function main() {
  const config = loadConfig();
  const pool = createPool({
    url: config.database.url,
    poolMax: config.database.poolMax,
    ssl: config.database.ssl,
  });
  const db = createDb(pool);
  const app = await buildApp({
    config,
    db,
    pool,
    clock: createClock(config.fixedToday),
    storage: new FileStorage(config.storageDir),
  });

  if (config.fixedToday)
    app.log.warn(
      `FIXED_TODAY=${config.fixedToday}: "today" is frozen (development only).`,
    );
  if (config.mail.transport !== "smtp")
    app.log.warn(
      `MAIL_TRANSPORT=${config.mail.transport}: recovery emails are not sent.`,
    );

  const jobs = startBackgroundJobs(
    { ...app.env(), log: app.log },
    createMailTransport(config, app.log),
  );

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info(`${signal} received, shutting down`);
    const timer = setTimeout(() => {
      app.log.error("graceful shutdown timed out");
      process.exit(1);
    }, 15_000);
    timer.unref();
    try {
      await app.close();
      await jobs.stop();
      await db.destroy();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "error during shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
