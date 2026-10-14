/**
 * Member search, status filters, counts and orderings (design.md §8, §14),
 * shared by the backend and the in-browser mock so lists behave identically.
 */

import type {
  MemberSortField,
  MembershipCounts,
  MembershipPeriod,
  MembershipState,
  MemberSummary,
  SortOrder,
} from "../api/types";
import type { MembershipStatus } from "./membership";
import { phoneSearchDigits } from "./phone";

export interface SearchableMember {
  memberCode: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

/** Number part of a member code: "GYM-00124" → 124. */
export function memberNumber(memberCode: string): number {
  return Number(memberCode.slice(4));
}

/**
 * Lookup by member ID ("GYM-00124", "124"), phone in any format ("0911 234",
 * "+251911…") or name/email words in any order.
 */
export function matchesMemberSearch(
  member: SearchableMember,
  raw: string | undefined,
): boolean {
  const query = (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!query) return true;

  const code = /^(?:gym)?[\s-]?0*(\d+)$/i.exec(query.replace(/\s/g, ""));
  if (code && query.startsWith("gym"))
    return memberNumber(member.memberCode) === Number(code[1]);
  if (code && memberNumber(member.memberCode) === Number(code[1])) return true;

  const digits = phoneSearchDigits(query);
  if (digits && member.phone.slice(4).includes(digits)) return true;

  const haystack =
    `${member.firstName} ${member.lastName} ${member.email ?? ""}`.toLowerCase();
  return query.split(" ").every((token) => haystack.includes(token));
}

/** "Active" includes Expiring Soon everywhere (design.md §8, §14). */
export function matchesStatusFilter(
  status: MembershipStatus,
  filter: MembershipStatus | undefined,
): boolean {
  if (!filter) return true;
  if (filter === "ACTIVE")
    return status === "ACTIVE" || status === "EXPIRING_SOON";
  return status === filter;
}

/** Plan shown in "Current / Next Plan": current, else next, else last. */
export function displayPeriod(state: MembershipState): MembershipPeriod | null {
  return state.current ?? state.next ?? state.last;
}

export function countStatuses(
  statuses: Iterable<MembershipStatus>,
): MembershipCounts {
  const counts: MembershipCounts = {
    all: 0,
    active: 0,
    expiringSoon: 0,
    expired: 0,
    scheduled: 0,
    unpaid: 0,
  };
  for (const status of statuses) {
    counts.all++;
    switch (status) {
      case "ACTIVE":
        counts.active++;
        break;
      case "EXPIRING_SOON":
        counts.active++;
        counts.expiringSoon++;
        break;
      case "EXPIRED":
        counts.expired++;
        break;
      case "SCHEDULED":
        counts.scheduled++;
        break;
      case "UNPAID":
        counts.unpaid++;
        break;
    }
  }
  return counts;
}

/** Monitoring order: expiring soonest, recently expired, active by end date, scheduled, unpaid. */
export function attentionRank(
  row: Pick<MemberSummary, "membership" | "registrationDate">,
): [number, string] {
  const m = row.membership;
  switch (m.status) {
    case "EXPIRING_SOON":
      return [0, m.coverageEnd ?? ""];
    case "EXPIRED":
      return [
        1,
        String(99999999 - Number((m.last?.endDate ?? "0").replace(/-/g, ""))),
      ];
    case "ACTIVE":
      return [2, m.coverageEnd ?? ""];
    case "SCHEDULED":
      return [3, m.next?.startDate ?? ""];
    case "UNPAID":
      return [
        4,
        String(99999999 - Number(row.registrationDate.replace(/-/g, ""))),
      ];
  }
}

export function compareByAttention(a: MemberSummary, b: MemberSummary): number {
  const [ra, ka] = attentionRank(a);
  const [rb, kb] = attentionRank(b);
  return (
    ra - rb || ka.localeCompare(kb) || a.fullName.localeCompare(b.fullName)
  );
}

const endKey = (row: MemberSummary) =>
  row.membership.coverageEnd ?? row.membership.last?.endDate ?? "9999-12-31";

const SORTERS: Record<
  MemberSortField,
  (a: MemberSummary, b: MemberSummary) => number
> = {
  name: (a, b) =>
    a.fullName.localeCompare(b.fullName) ||
    a.memberCode.localeCompare(b.memberCode),
  memberCode: (a, b) => a.memberCode.localeCompare(b.memberCode),
  endDate: (a, b) =>
    endKey(a).localeCompare(endKey(b)) || a.fullName.localeCompare(b.fullName),
  registrationDate: (a, b) =>
    a.registrationDate.localeCompare(b.registrationDate) ||
    a.memberCode.localeCompare(b.memberCode),
};

export function sortMembers(
  rows: MemberSummary[],
  sort: MemberSortField = "name",
  order: SortOrder = "asc",
) {
  const direction = order === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => direction * SORTERS[sort](a, b));
}

export const MAX_PAGE_SIZE = 100;

/** Bounded page of an in-memory list (backend design §8: maximum page size 100). */
export function paginate<T>(items: T[], page = 1, pageSize = 10) {
  const size = Math.min(Math.max(1, Math.floor(pageSize) || 10), MAX_PAGE_SIZE);
  const total = items.length;
  const lastPage = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), lastPage);
  return {
    items: items.slice((current - 1) * size, current * size),
    total,
    page: current,
    pageSize: size,
  };
}
