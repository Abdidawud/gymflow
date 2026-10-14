/**
 * Member rows, their paid periods and the derived membership state.
 *
 * Status is never stored (backend design §5): it is computed on every read
 * from the periods that matter as of today, with the same rules the web app
 * uses (packages/shared/src/domain/membership.ts).
 */

import type {
  MemberDetail,
  MembershipPeriod,
  MembershipState,
  MemberSummary,
} from "@gymflow/shared/api/types";
import type { DateOnly } from "@gymflow/shared/domain/dates";
import { evaluateMembership } from "@gymflow/shared/domain/membership";
import { sql } from "kysely";
import type { Db, Tx } from "../db";
import type { Env } from "../http/context";

export const MEMBER_COLUMNS = [
  "members.id",
  "members.member_code",
  "members.first_name",
  "members.last_name",
  "members.phone",
  "members.email",
  "members.gender",
  "members.photo_storage_key",
  "members.photo_updated_at",
  "members.emergency_name",
  "members.emergency_phone",
  "members.emergency_relationship",
  "members.address",
  "members.notes",
  "members.is_archived",
  "members.archived_at",
  "members.registration_date",
  "members.created_at",
  "members.updated_at",
] as const;

export function selectMembers(db: Db | Tx) {
  return db.selectFrom("members").select(MEMBER_COLUMNS);
}

export type MemberRow = Awaited<
  ReturnType<ReturnType<typeof selectMembers>["executeTakeFirstOrThrow"]>
>;

export interface PeriodRow {
  id: string;
  member_id: string;
  plan_id: string;
  plan_name_snapshot: string;
  price_snapshot: string;
  duration_days_snapshot: number;
  start_date: DateOnly;
  end_date: DateOnly;
  is_renewal: boolean;
  created_at: Date;
  payment_id: string;
  payment_code: string;
}

function periodQuery(db: Db | Tx) {
  return db
    .selectFrom("memberships as m")
    .innerJoin("payments as p", "p.membership_id", "m.id")
    .select([
      "m.id",
      "m.member_id",
      "m.plan_id",
      "m.plan_name_snapshot",
      "m.price_snapshot",
      "m.duration_days_snapshot",
      "m.start_date",
      "m.end_date",
      "m.is_renewal",
      "m.created_at",
      "p.id as payment_id",
      "p.payment_code",
    ]);
}

/**
 * Periods that decide each member's state as of `today`: everything current or
 * upcoming (for continuous coverage) plus the most recently ended period
 * (for "Expired on …"). Older history is irrelevant to the status.
 */
export async function loadRelevantPeriods(
  db: Db | Tx,
  today: DateOnly,
  memberIds?: readonly string[],
): Promise<Map<string, PeriodRow[]>> {
  if (memberIds && memberIds.length === 0) return new Map();
  const forMembers = memberIds
    ? sql<boolean>`m.member_id = any(${[...memberIds]}::uuid[])`
    : sql<boolean>`true`;

  const [upcoming, lastEnded] = await Promise.all([
    periodQuery(db)
      .where("m.end_date", ">=", today)
      .where(forMembers)
      .execute(),
    periodQuery(db)
      .where("m.end_date", "<", today)
      .where(forMembers)
      .distinctOn("m.member_id")
      .orderBy("m.member_id")
      .orderBy("m.end_date", "desc")
      .execute(),
  ]);

  const byMember = new Map<string, PeriodRow[]>();
  for (const row of [...lastEnded, ...upcoming]) {
    const list = byMember.get(row.member_id) ?? [];
    list.push(row);
    byMember.set(row.member_id, list);
  }
  for (const list of byMember.values())
    list.sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
  return byMember;
}

/** Every period of one member, oldest first, locked when called inside a payment transaction. */
export async function loadAllPeriods(
  db: Db | Tx,
  memberId: string,
): Promise<PeriodRow[]> {
  return periodQuery(db)
    .where("m.member_id", "=", memberId)
    .orderBy("m.start_date")
    .execute();
}

export function periodDto(p: PeriodRow): MembershipPeriod {
  return {
    id: p.id,
    planId: p.plan_id,
    planName: p.plan_name_snapshot,
    durationDays: p.duration_days_snapshot,
    price: p.price_snapshot,
    startDate: p.start_date,
    endDate: p.end_date,
    isRenewal: p.is_renewal,
    paymentId: p.payment_id,
    paymentCode: p.payment_code,
    createdAt: p.created_at.toISOString(),
  };
}

export function membershipState(
  periods: readonly PeriodRow[],
  today: DateOnly,
  warningDays: number,
): MembershipState {
  const e = evaluateMembership(
    periods.map((p) => ({
      ...p,
      startDate: p.start_date,
      endDate: p.end_date,
    })),
    today,
    warningDays,
  );
  return {
    status: e.status,
    current: e.current ? periodDto(e.current) : null,
    next: e.next ? periodDto(e.next) : null,
    last: e.last ? periodDto(e.last) : null,
    coverageEnd: e.coverageEnd,
    remainingDays: e.remainingDays,
    daysUntilStart: e.daysUntilStart,
    hasPaidMembership: e.hasPaidMembership,
  };
}

/** Authenticated photo URL; the version busts browser caches after a change. */
export function photoUrl(
  env: Env,
  member: Pick<MemberRow, "id" | "photo_updated_at">,
): string | null {
  return member.photo_updated_at
    ? `${env.config.publicApiPath}/members/${member.id}/photo?v=${member.photo_updated_at.getTime()}`
    : null;
}

export function fullName(member: {
  first_name: string;
  last_name: string;
}): string {
  return `${member.first_name} ${member.last_name}`;
}

export function memberSummaryDto(
  env: Env,
  member: MemberRow,
  periods: readonly PeriodRow[],
  today: DateOnly,
  warningDays: number,
): MemberSummary {
  return {
    id: member.id,
    memberCode: member.member_code,
    firstName: member.first_name,
    lastName: member.last_name,
    fullName: fullName(member),
    phone: member.phone,
    email: member.email,
    photoUrl: photoUrl(env, member),
    isArchived: member.is_archived,
    registrationDate: member.registration_date,
    membership: membershipState(periods, today, warningDays),
  };
}

export async function memberDetailDto(
  env: Env,
  db: Db | Tx,
  member: MemberRow,
  options: {
    today: DateOnly;
    warningDays: number;
    canArchive: boolean;
    hasPlans: boolean;
  },
): Promise<MemberDetail> {
  const [periods, counts] = await Promise.all([
    loadRelevantPeriods(db, options.today, [member.id]),
    db
      .selectFrom("memberships")
      .select((eb) => [eb.fn.countAll<string>().as("memberships")])
      .where("member_id", "=", member.id)
      .executeTakeFirstOrThrow(),
  ]);
  const own = periods.get(member.id) ?? [];
  return {
    ...memberSummaryDto(env, member, own, options.today, options.warningDays),
    gender: member.gender,
    emergencyName: member.emergency_name,
    emergencyPhone: member.emergency_phone,
    emergencyRelationship: member.emergency_relationship,
    address: member.address,
    notes: member.notes,
    archivedAt: member.archived_at?.toISOString() ?? null,
    createdAt: member.created_at.toISOString(),
    updatedAt: member.updated_at.toISOString(),
    upcoming: own.filter((p) => p.start_date > options.today).map(periodDto),
    // One payment funds exactly one membership period.
    paymentCount: Number(counts.memberships),
    membershipCount: Number(counts.memberships),
    permittedActions: {
      edit: true,
      recordPayment: !member.is_archived && options.hasPlans,
      archive: options.canArchive && !member.is_archived,
      reactivate: options.canArchive && member.is_archived,
    },
  };
}
