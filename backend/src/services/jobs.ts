/**
 * Background work for one API process: email delivery and periodic cleanup
 * of expired sessions and tokens (backend design §13). Cleanup takes a
 * PostgreSQL advisory lock so only one instance runs it at a time.
 */

import { sql } from "kysely";
import type { Env } from "../http/context";
import { deliverOutbox, type MailTransport } from "./mail";

const CLEANUP_LOCK_ID = 730_122_020;

export async function cleanup(env: Env): Promise<void> {
  const idleCutoff = new Date(
    Date.now() - env.config.session.idleMinutes * 60_000,
  );
  await sql`SELECT pg_try_advisory_lock(${CLEANUP_LOCK_ID}) AS locked`
    .execute(env.db)
    .then(async (result) => {
      const locked = (result.rows[0] as { locked: boolean } | undefined)
        ?.locked;
      if (!locked) return;
      try {
        await env.db
          .deleteFrom("sessions")
          .where((eb) =>
            eb.or([
              eb("expires_at", "<=", new Date()),
              eb("last_seen_at", "<", idleCutoff),
            ]),
          )
          .execute();
        await env.db
          .deleteFrom("password_resets")
          .where((eb) =>
            eb.or([
              eb("expires_at", "<", new Date(Date.now() - 86_400_000)),
              eb("consumed_at", "is not", null),
            ]),
          )
          .execute();
        await env.db
          .deleteFrom("login_failures")
          .where("created_at", "<", new Date(Date.now() - 86_400_000))
          .execute();
        await env.db
          .deleteFrom("email_outbox")
          .where((eb) =>
            eb.or([
              eb("sent_at", "<", new Date(Date.now() - 7 * 86_400_000)),
              eb("expires_at", "<", new Date(Date.now() - 86_400_000)),
            ]),
          )
          .execute();
      } finally {
        await sql`SELECT pg_advisory_unlock(${CLEANUP_LOCK_ID})`.execute(
          env.db,
        );
      }
    });
}

export function startBackgroundJobs(
  env: Env,
  transport: MailTransport,
): { stop(): Promise<void> } {
  let running = true;
  let busy: Promise<unknown> = Promise.resolve();

  const run = (task: () => Promise<unknown>, what: string) => {
    if (!running) return;
    busy = busy
      .then(task)
      .catch((error: unknown) =>
        env.log.error({ err: error }, `${what} failed`),
      );
  };

  const mailTimer = setInterval(
    () =>
      run(
        () => deliverOutbox(env.db, transport, env.config.mail.from, env.log),
        "email delivery",
      ),
    5_000,
  );
  const cleanupTimer = setInterval(
    () => run(() => cleanup(env), "cleanup"),
    30 * 60_000,
  );
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
