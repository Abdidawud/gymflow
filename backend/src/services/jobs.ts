/**
 * Maintenance work (backend design §13): email delivery and cleanup of
 * expired sessions, tokens and delivered mail. The standalone server runs it
 * on timers; on Vercel, a daily cron calls /api/v1/internal/cron and emails
 * are also sent right after the request that queued them.
 */

import { sql } from "kysely";
import type { Env } from "../http/context";
import { deliverOutbox } from "./mail";

const CLEANUP_LOCK_ID = 730_122_020;
const DAY_MS = 86_400_000;

/** Deletes expired records. A transaction-scoped lock keeps two runs from overlapping (pooler-safe). */
export async function cleanup(env: Env): Promise<{ ran: boolean }> {
  const idleCutoff = new Date(Date.now() - env.config.session.idleMinutes * 60_000);
  return env.db.transaction().execute(async (tx) => {
    const lock = await sql<{ locked: boolean }>`SELECT pg_try_advisory_xact_lock(${CLEANUP_LOCK_ID}) AS locked`.execute(
      tx,
    );
    if (!lock.rows[0]?.locked) return { ran: false };
    const now = Date.now();
    await tx
      .deleteFrom("sessions")
      .where((eb) => eb.or([eb("expires_at", "<=", new Date(now)), eb("last_seen_at", "<", idleCutoff)]))
      .execute();
    await tx
      .deleteFrom("password_resets")
      .where((eb) => eb.or([eb("expires_at", "<", new Date(now - DAY_MS)), eb("consumed_at", "is not", null)]))
      .execute();
    await tx
      .deleteFrom("login_failures")
      .where("created_at", "<", new Date(now - DAY_MS))
      .execute();
    await tx
      .deleteFrom("email_outbox")
      .where((eb) =>
        eb.or([eb("sent_at", "<", new Date(now - 7 * DAY_MS)), eb("expires_at", "<", new Date(now - DAY_MS))]),
      )
      .execute();
    return { ran: true };
  });
}

/** Sends any email waiting in the outbox. */
export function sendPendingEmail(env: Env): Promise<number> {
  return deliverOutbox(env.db, env.mail, env.config.mail.from, env.log);
}

/** Timers for the long-running standalone server (not used on Vercel). */
export function startBackgroundJobs(env: Env): { stop(): Promise<void> } {
  let running = true;
  let busy: Promise<unknown> = Promise.resolve();

  const run = (task: () => Promise<unknown>, what: string) => {
    if (!running) return;
    busy = busy.then(task).catch((error: unknown) => env.log.error({ err: error }, `${what} failed`));
  };

  const mailTimer = setInterval(() => run(() => sendPendingEmail(env), "email delivery"), 60_000);
  const cleanupTimer = setInterval(() => run(() => cleanup(env), "cleanup"), 30 * 60_000);
  mailTimer.unref();
  cleanupTimer.unref();
  run(() => cleanup(env), "cleanup");

  return {
    async stop() {
      running = false;
      clearInterval(mailTimer);
      clearInterval(cleanupTimer);
      await busy;
    },
  };
}
