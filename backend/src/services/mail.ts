/**
 * Outgoing email through an outbox (backend design §13): messages are queued
 * in the same transaction as the change that needs them and delivered by a
 * background worker with retries, so requests never wait on the mail server
 * and a mail outage never blocks payments or sign-in.
 */

import type { FastifyBaseLogger } from "fastify";
import nodemailer from "nodemailer";
import type { Config } from "../config";
import type { Db, Tx } from "../db";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /** Undelivered email is dropped after this (e.g. when a reset link expires). */
  expiresAt: Date;
}

export async function enqueueEmail(db: Db | Tx, email: OutgoingEmail): Promise<void> {
  await db
    .insertInto("email_outbox")
    .values({
      recipient: email.to,
      subject: email.subject,
      body_text: email.text,
      expires_at: email.expiresAt,
    })
    .execute();
}

export interface MailTransport {
  send(message: { from: string; to: string; subject: string; text: string }): Promise<void>;
}

export function createMailTransport(config: Config, log: FastifyBaseLogger): MailTransport {
  switch (config.mail.transport) {
    case "smtp": {
      const transporter = nodemailer.createTransport(config.mail.smtpUrl!);
      return {
        async send(message) {
          await transporter.sendMail(message);
        },
      };
    }
    case "log":
      // Development only (refused in production): shows the message, including reset links.
      return {
        async send(message) {
          log.info(
            { mail: { to: message.to, subject: message.subject } },
            `email (MAIL_TRANSPORT=log)\n${message.text}`,
          );
        },
      };
    case "disabled":
      return {
        async send(message) {
          log.warn({ mail: { to: message.to, subject: message.subject } }, "email dropped (MAIL_TRANSPORT=disabled)");
        },
      };
  }
}

const MAX_ATTEMPTS = 6;

/** Delivers due messages once; returns how many were sent. */
export async function deliverOutbox(db: Db, transport: MailTransport, from: string, log: FastifyBaseLogger) {
  return db.transaction().execute(async (tx) => {
    const due = await tx
      .selectFrom("email_outbox")
      .select(["id", "recipient", "subject", "body_text", "attempts"])
      .where("sent_at", "is", null)
      .where("send_after", "<=", new Date())
      .where("expires_at", ">", new Date())
      .where("attempts", "<", MAX_ATTEMPTS)
      .orderBy("id")
      .limit(10)
      .forUpdate()
      .skipLocked()
      .execute();
    let sent = 0;
    for (const email of due) {
      try {
        await transport.send({
          from,
          to: email.recipient,
          subject: email.subject,
          text: email.body_text ?? "",
        });
        await tx
          .updateTable("email_outbox")
          .set({
            sent_at: new Date(),
            body_text: null,
            body_html: null,
            last_error: null,
          })
          .where("id", "=", email.id)
          .execute();
        sent++;
      } catch (error) {
        const attempts = email.attempts + 1;
        log.warn({ err: error, outboxId: email.id, attempts }, "email delivery failed");
        await tx
          .updateTable("email_outbox")
          .set({
            attempts,
            last_error: String((error as Error).message).slice(0, 500),
            send_after: new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000),
          })
          .where("id", "=", email.id)
          .execute();
      }
    }
    return sent;
  });
}
