/**
 * Membership validity rules (design.md §5, backend design §5).
 *
 * - Start and end dates are inclusive: end = start + duration − 1.
 * - A membership is valid through its end date and expires the next day.
 * - Remaining days exclude today: end − today. On the end date: "Expires today".
 * - Status is always derived from paid periods; it is never stored.
 *
 * The mock API uses these functions as its "server" logic; the real backend
 * must implement the same rules (and is authoritative once connected).
 */

import { addDays, daysBetween, type DateOnly } from "./dates";

export const MEMBERSHIP_STATUSES = ["ACTIVE", "EXPIRING_SOON", "EXPIRED", "SCHEDULED", "UNPAID"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const DEFAULT_WARNING_DAYS = 7;

export interface CoveragePeriod {
  startDate: DateOnly;
  endDate: DateOnly;
}

export function membershipEndDate(startDate: DateOnly, durationDays: number): DateOnly {
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new RangeError(`Duration must be a positive whole number of days, got ${durationDays}`);
  }
  return addDays(startDate, durationDays - 1);
}

function byStart<P extends CoveragePeriod>(a: P, b: P): number {
  return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
}

/**
 * Last date of the uninterrupted chain of paid periods that begins with `from`.
 * Contiguous means the next period starts the day after the previous one ends.
 */
export function continuousCoverageEnd<P extends CoveragePeriod>(periods: readonly P[], from: P): DateOnly {
  const sorted = [...periods].sort(byStart);
  let end = from.endDate;
  for (const period of sorted) {
    if (period.startDate <= end) {
      if (period.endDate > end && period.startDate >= from.startDate) end = period.endDate;
      continue;
    }
    if (period.startDate === addDays(end, 1)) {
      end = period.endDate;
      continue;
    }
    break;
  }
  return end;
}

export interface MembershipEvaluation<P extends CoveragePeriod> {
  status: MembershipStatus;
  /** Period covering today. */
  current: P | null;
  /** Earliest period starting after today. */
  next: P | null;
  /** Most recently ended period. */
  last: P | null;
  /** End of continuous paid coverage starting with the current (or next) period. */
  coverageEnd: DateOnly | null;
  /** coverageEnd − today, when covered today. */
  remainingDays: number | null;
  /** next.startDate − today, when not covered today but a future period exists. */
  daysUntilStart: number | null;
  hasPaidMembership: boolean;
}

/**
 * Display priority: current period first; otherwise earliest future period;
 * otherwise most recently ended period; otherwise Unpaid (backend design §5).
 *
 * Remaining days are measured to the end of continuous coverage, so a member
 * who already prepaid a back-to-back renewal is not flagged as Expiring Soon.
 */
export function evaluateMembership<P extends CoveragePeriod>(
  periods: readonly P[],
  today: DateOnly,
  warningDays: number = DEFAULT_WARNING_DAYS,
): MembershipEvaluation<P> {
  const sorted = [...periods].sort(byStart);
  const current = sorted.find((p) => p.startDate <= today && today <= p.endDate) ?? null;
  const next = sorted.find((p) => p.startDate > today) ?? null;
  const ended = sorted.filter((p) => p.endDate < today);
  const last = ended.length > 0 ? ended.reduce((a, b) => (b.endDate > a.endDate ? b : a)) : null;

  const base = { current, next, last, hasPaidMembership: sorted.length > 0 };

  if (current) {
    const coverageEnd = continuousCoverageEnd(sorted, current);
    const remainingDays = daysBetween(today, coverageEnd);
    return {
      ...base,
      status: remainingDays <= warningDays ? "EXPIRING_SOON" : "ACTIVE",
      coverageEnd,
      remainingDays,
      daysUntilStart: null,
    };
  }
  if (next) {
    return {
      ...base,
      status: "SCHEDULED",
      coverageEnd: continuousCoverageEnd(sorted, next),
      remainingDays: null,
      daysUntilStart: daysBetween(today, next.startDate),
    };
  }
  return {
    ...base,
    status: last ? "EXPIRED" : "UNPAID",
    coverageEnd: null,
    remainingDays: null,
    daysUntilStart: null,
  };
}

export interface ProposedStart {
  startDate: DateOnly;
  /** True for continuous renewals, where the start date is fixed and read-only. */
  automatic: boolean;
}

/**
 * Default start for a new purchase (design.md §5, §12):
 * - covered today → the day after continuous coverage ends (read-only);
 * - scheduled → the day after the scheduled chain ends (editable, today or later);
 * - expired / unpaid → today (editable, today or later).
 */
export function proposeStartDate<P extends CoveragePeriod>(periods: readonly P[], today: DateOnly): ProposedStart {
  const evaluation = evaluateMembership(periods, today);
  if (evaluation.current && evaluation.coverageEnd) {
    return { startDate: addDays(evaluation.coverageEnd, 1), automatic: true };
  }
  if (evaluation.next && evaluation.coverageEnd) {
    return { startDate: addDays(evaluation.coverageEnd, 1), automatic: false };
  }
  return { startDate: today, automatic: false };
}

/** First existing period that overlaps the proposed inclusive range, if any. */
export function findOverlap<P extends CoveragePeriod>(
  periods: readonly P[],
  startDate: DateOnly,
  endDate: DateOnly,
): P | null {
  return periods.find((p) => !(endDate < p.startDate || startDate > p.endDate)) ?? null;
}

// ---------------------------------------------------------------------------
// Status details as data. Wording lives in the i18n layer (src/i18n/membership.ts),
// so the same rules serve every language; status always ships with text (design.md §3).
// ---------------------------------------------------------------------------

export interface StatusDetailInput {
  status: MembershipStatus;
  remainingDays: number | null;
  daysUntilStart: number | null;
  nextStartDate: DateOnly | null;
  lastEndDate: DateOnly | null;
}

export type StatusDetail =
  | { kind: "daysLeft"; days: number }
  | { kind: "expiresToday" }
  | { kind: "starts"; date: DateOnly }
  | { kind: "ended"; date: DateOnly };

/** Qualifier shown next to a status: days left, expires today, start date or end date. */
export function statusDetail(input: StatusDetailInput): StatusDetail | null {
  switch (input.status) {
    case "ACTIVE":
    case "EXPIRING_SOON":
      if (input.remainingDays === null) return null;
      return input.remainingDays === 0 ? { kind: "expiresToday" } : { kind: "daysLeft", days: input.remainingDays };
    case "SCHEDULED":
      return input.nextStartDate ? { kind: "starts", date: input.nextStartDate } : null;
    case "EXPIRED":
      return input.lastEndDate ? { kind: "ended", date: input.lastEndDate } : null;
    case "UNPAID":
      return null;
  }
}
