/**
 * Append-only audit trail (backend design §6): who changed what and when,
 * written in the same transaction as the change. No passwords, tokens or full
 * request bodies — only a short summary of the change.
 */

import type { Db, Tx } from "../db";
import type { RequestContext } from "../http/context";

export type AuditAction =
  | "payment.create"
  | "member.archive"
  | "member.reactivate"
  | "plan.create"
  | "plan.update"
  | "plan.disable"
  | "plan.enable"
  | "staff.create"
  | "staff.update"
  | "staff.deactivate"
  | "staff.activate"
  | "staff.password_reset"
  | "settings.update";

export async function audit(
  db: Db | Tx,
  ctx: RequestContext,
  action: AuditAction,
  entity: { type: string; id: string | null },
  summary: Record<string, unknown> | null = null,
  at: Date = new Date(),
): Promise<void> {
  await db
    .insertInto("audit_events")
    .values({
      actor_id: ctx.actor?.id ?? null,
      action,
      entity_type: entity.type,
      entity_id: entity.id,
      request_id: ctx.requestId,
      summary: summary ? JSON.stringify(summary) : null,
      created_at: at,
    })
    .execute();
}
