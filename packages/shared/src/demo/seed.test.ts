import { describe, expect, it } from "vitest";
import {
  evaluateMembership,
  findOverlap,
  membershipEndDate,
} from "../domain/membership";
import { sumMoney } from "../domain/money";
import { startOfEthiopianMonth } from "../domain/ethiopian-calendar";
import { SEED_TODAY } from "./clock";
import { DEMO_STAFF_IDS, demoMemberId } from "./ids";
import { generateDemoData } from "./seed";

const db = generateDemoData();

function statusOf(memberId: string) {
  const periods = db.memberships.filter((m) => m.memberId === memberId);
  return evaluateMembership(periods, SEED_TODAY, 7);
}

describe("demo dataset", () => {
  it("is deterministic", () => {
    expect(generateDemoData()).toEqual(db);
  });

  it("reconciles membership counts for current members", () => {
    const counts: Record<string, number> = {};
    for (const member of db.members.filter((m) => !m.isArchived)) {
      const status = statusOf(member.id).status;
      counts[status] = (counts[status] ?? 0) + 1;
    }
    expect(counts).toEqual({
      ACTIVE: 286,
      EXPIRING_SOON: 20,
      EXPIRED: 35,
      UNPAID: 8,
      SCHEDULED: 1,
    });
    expect(db.members.filter((m) => m.isArchived)).toHaveLength(6);
  });

  it("keeps the design fixtures exact", () => {
    const byCode = (code: string) =>
      db.members.find((m) => m.memberCode === code)!;
    expect(byCode("GYM-00124").firstName).toBe("Abebe");
    expect(statusOf(byCode("GYM-00124").id)).toMatchObject({
      status: "ACTIVE",
      remainingDays: 23,
    });
    expect(statusOf(byCode("GYM-00125").id)).toMatchObject({
      status: "EXPIRING_SOON",
      remainingDays: 3,
    });
    expect(statusOf(byCode("GYM-00126").id).status).toBe("EXPIRED");
    expect(statusOf(byCode("GYM-00127").id).status).toBe("UNPAID");
    expect(statusOf(byCode("GYM-00128").id)).toMatchObject({
      status: "SCHEDULED",
      daysUntilStart: 5,
    });

    const receipt = db.payments.find((p) => p.paymentCode === "PAY-10234")!;
    expect(receipt).toMatchObject({
      memberId: demoMemberId(124),
      receivedDate: "2026-10-01",
      method: "CASH",
      amount: "1500.00",
    });
    expect(receipt.recordedBy).toBe(DEMO_STAFF_IDS.abdi);
  });

  it("uses valid UUIDs for every record, as the database requires", () => {
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const ids = [
      db.staff,
      db.members,
      db.plans,
      db.memberships,
      db.payments,
    ].flatMap((rows) => rows.map((r) => r.id));
    expect(ids.every((id) => uuid.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never creates overlapping periods or payments in the future", () => {
    const byMember = new Map<string, typeof db.memberships>();
    for (const m of db.memberships)
      byMember.set(m.memberId, [...(byMember.get(m.memberId) ?? []), m]);
    for (const periods of byMember.values()) {
      periods.forEach((period, i) => {
        expect(
          membershipEndDate(period.startDate, period.durationDaysSnapshot),
        ).toBe(period.endDate);
        expect(
          findOverlap(periods.slice(i + 1), period.startDate, period.endDate),
        ).toBeNull();
      });
    }
    expect(db.payments.every((p) => p.receivedDate <= SEED_TODAY)).toBe(true);
    expect(new Set(db.members.map((m) => m.phone)).size).toBe(
      db.members.length,
    );
    expect(new Set(db.payments.map((p) => p.paymentCode)).size).toBe(
      db.payments.length,
    );
  });

  it("produces plausible revenue for the dashboard", () => {
    const today = db.payments.filter((p) => p.receivedDate === SEED_TODAY);
    const monthStart = startOfEthiopianMonth(SEED_TODAY); // Meskerem 1, 2019
    const month = db.payments.filter(
      (p) => p.receivedDate >= monthStart && p.receivedDate <= SEED_TODAY,
    );
    console.info(
      `payments=${db.payments.length} today=${today.length}/${sumMoney(today.map((p) => p.amount))} ` +
        `month=${month.length}/${sumMoney(month.map((p) => p.amount))}`,
    );
    expect(today.length).toBeGreaterThan(0);
    expect(month.length).toBeGreaterThan(today.length);
  });
});
