/**
 * Payment rows joined with their purchased period, member and recorder, and
 * the DTOs built from them. Plan details always come from the purchase-time
 * snapshot, so renaming or repricing a plan never rewrites history.
 */

import type { PaymentDetail, PaymentSummary } from "@gymflow/shared/api/types";
import type { Db, Tx } from "../db";
import type { Env, RequestContext } from "../http/context";
import { photoUrl } from "./members";

export function selectPayments(db: Db | Tx) {
  return db
    .selectFrom("payments as p")
    .innerJoin("memberships as ms", "ms.id", "p.membership_id")
    .innerJoin("members as mb", "mb.id", "p.member_id")
    .leftJoin("staff as s", "s.id", "p.recorded_by")
    .select([
      "p.id",
      "p.payment_code",
      "p.amount",
      "p.currency",
      "p.method",
      "p.received_date",
      "p.reference",
      "p.notes",
      "p.created_at",
      "p.recorded_by",
      "mb.id as member_id",
      "mb.member_code",
      "mb.first_name",
      "mb.last_name",
      "mb.phone",
      "mb.email",
      "mb.is_archived",
      "mb.photo_updated_at",
      "ms.id as membership_id",
      "ms.plan_id",
      "ms.plan_name_snapshot",
      "ms.duration_days_snapshot",
      "ms.price_snapshot",
      "ms.start_date",
      "ms.end_date",
      "ms.is_renewal",
      "s.full_name as recorder_name",
    ]);
}

export type PaymentRow = Awaited<ReturnType<ReturnType<typeof selectPayments>["execute"]>>[number];

export function paymentSummaryDto(env: Env, ctx: RequestContext, row: PaymentRow): PaymentSummary {
  return {
    id: row.id,
    paymentCode: row.payment_code,
    member: {
      id: row.member_id,
      memberCode: row.member_code,
      fullName: `${row.first_name} ${row.last_name}`,
      photoUrl: photoUrl(env, {
        id: row.member_id,
        photo_updated_at: row.photo_updated_at,
      }),
    },
    plan: {
      id: row.plan_id,
      name: row.plan_name_snapshot,
      durationDays: row.duration_days_snapshot,
    },
    amount: row.amount,
    currency: "ETB",
    method: row.method,
    receivedDate: row.received_date,
    reference: row.reference,
    recordedBy: {
      id: row.recorded_by,
      fullName: row.recorder_name ?? ctx.t("formerStaff"),
    },
    createdAt: row.created_at.toISOString(),
  };
}

export function paymentDetailDto(env: Env, ctx: RequestContext, row: PaymentRow): PaymentDetail {
  const summary = paymentSummaryDto(env, ctx, row);
  return {
    ...summary,
    notes: row.notes,
    member: {
      ...summary.member,
      phone: row.phone,
      email: row.email,
      isArchived: row.is_archived,
    },
    membership: {
      id: row.membership_id,
      planName: row.plan_name_snapshot,
      durationDays: row.duration_days_snapshot,
      price: row.price_snapshot,
      startDate: row.start_date,
      endDate: row.end_date,
      isRenewal: row.is_renewal,
    },
  };
}
