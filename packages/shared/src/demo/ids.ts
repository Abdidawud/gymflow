/**
 * Fixed, valid UUIDs for the demo dataset, so the in-browser mock, the real
 * database seed and the end-to-end tests all refer to the same records.
 * The kind sits in the fourth group: 00000000-0000-4000-8K00-NNNNNNNNNNNN.
 */

const KINDS = {
  staff: 1,
  member: 2,
  plan: 3,
  membership: 4,
  payment: 5,
} as const;

export function demoId(kind: keyof typeof KINDS, n: number): string {
  return `00000000-0000-4000-8${KINDS[kind]}00-${String(n).padStart(12, "0")}`;
}

/** Demo members are numbered by member code: GYM-00124 → demoMemberId(124). */
export const demoMemberId = (code: number) => demoId("member", code);

export const DEMO_STAFF_IDS = {
  abdi: demoId("staff", 1),
  tigist: demoId("staff", 2),
  dawit: demoId("staff", 3),
  selam: demoId("staff", 4),
} as const;
