import { describe, expect, it } from "vitest";
import {
  evaluateMembership,
  findOverlap,
  membershipEndDate,
  proposeStartDate,
  statusDetail,
  type CoveragePeriod,
} from "./membership";

const TODAY = "2026-10-07";
const period = (startDate: string, endDate: string): CoveragePeriod => ({ startDate, endDate });

function detail(periods: CoveragePeriod[], today = TODAY, warningDays = 7) {
  const e = evaluateMembership(periods, today, warningDays);
  return statusDetail({
    status: e.status,
    remainingDays: e.remainingDays,
    daysUntilStart: e.daysUntilStart,
    nextStartDate: e.next?.startDate ?? null,
    lastEndDate: e.last?.endDate ?? null,
  });
}

describe("membershipEndDate", () => {
  it("treats start and end as inclusive (30 days from Oct 01 ends Oct 30)", () => {
    expect(membershipEndDate("2026-10-01", 30)).toBe("2026-10-30");
  });
  it("covers a single day for a daily pass", () => {
    expect(membershipEndDate("2026-10-07", 1)).toBe("2026-10-07");
  });
  it("crosses month and year boundaries by whole days", () => {
    expect(membershipEndDate("2026-07-13", 90)).toBe("2026-10-10");
    expect(membershipEndDate("2026-12-15", 30)).toBe("2027-01-13");
  });
  it("rejects non-positive durations", () => {
    expect(() => membershipEndDate("2026-10-07", 0)).toThrow(RangeError);
  });
});

describe("evaluateMembership — design fixtures on Oct 07, 2026", () => {
  it("Abebe Kebede: Active with 23 days left", () => {
    const e = evaluateMembership([period("2026-10-01", "2026-10-30")], TODAY);
    expect(e.status).toBe("ACTIVE");
    expect(e.remainingDays).toBe(23);
    expect(detail([period("2026-10-01", "2026-10-30")])).toEqual({ kind: "daysLeft", days: 23 });
  });

  it("Hana Tesfaye: Expiring Soon with 3 days left", () => {
    const e = evaluateMembership([period("2026-07-13", "2026-10-10")], TODAY);
    expect(e.status).toBe("EXPIRING_SOON");
    expect(e.remainingDays).toBe(3);
  });

  it("Dawit Bekele: Expired", () => {
    const e = evaluateMembership([period("2026-09-01", "2026-09-30")], TODAY);
    expect(e.status).toBe("EXPIRED");
    expect(e.last?.endDate).toBe("2026-09-30");
  });

  it("Sara Mohammed: Unpaid", () => {
    const e = evaluateMembership([], TODAY);
    expect(e.status).toBe("UNPAID");
    expect(e.hasPaidMembership).toBe(false);
  });

  it("Meron Alemu: Scheduled, starts Oct 12, never presented as valid", () => {
    const e = evaluateMembership([period("2026-10-12", "2026-11-10")], TODAY);
    expect(e.status).toBe("SCHEDULED");
    expect(e.current).toBeNull();
    expect(e.daysUntilStart).toBe(5);
    expect(detail([period("2026-10-12", "2026-11-10")])).toEqual({ kind: "starts", date: "2026-10-12" });
  });
});

describe("evaluateMembership — boundaries", () => {
  it("is valid on the end date and says 'Expires today'", () => {
    const e = evaluateMembership([period("2026-09-08", "2026-10-07")], "2026-10-07");
    expect(e.status).toBe("EXPIRING_SOON");
    expect(e.remainingDays).toBe(0);
    expect(detail([period("2026-09-08", "2026-10-07")], "2026-10-07")).toEqual({ kind: "expiresToday" });
  });

  it("expires the day after the end date", () => {
    expect(evaluateMembership([period("2026-09-08", "2026-10-07")], "2026-10-08").status).toBe("EXPIRED");
  });

  it("uses the warning threshold inclusively", () => {
    // 7 days remaining → expiring; 8 → active.
    expect(evaluateMembership([period("2026-10-01", "2026-10-14")], TODAY).status).toBe("EXPIRING_SOON");
    expect(evaluateMembership([period("2026-10-01", "2026-10-15")], TODAY).status).toBe("ACTIVE");
  });

  it("supports a zero-day warning threshold", () => {
    expect(evaluateMembership([period("2026-10-01", "2026-10-07")], TODAY, 0).status).toBe("EXPIRING_SOON");
    expect(evaluateMembership([period("2026-10-01", "2026-10-08")], TODAY, 0).status).toBe("ACTIVE");
  });

  it("measures remaining days to the end of continuous prepaid coverage", () => {
    const e = evaluateMembership([period("2026-09-10", "2026-10-09"), period("2026-10-10", "2026-11-08")], TODAY);
    expect(e.status).toBe("ACTIVE");
    expect(e.coverageEnd).toBe("2026-11-08");
    expect(e.remainingDays).toBe(32);
  });

  it("does not extend coverage across a gap", () => {
    const e = evaluateMembership([period("2026-09-10", "2026-10-09"), period("2026-10-20", "2026-11-18")], TODAY);
    expect(e.status).toBe("EXPIRING_SOON");
    expect(e.coverageEnd).toBe("2026-10-09");
    expect(e.next?.startDate).toBe("2026-10-20");
  });

  it("prefers Scheduled over Expired when a future period exists", () => {
    const e = evaluateMembership([period("2026-08-01", "2026-08-30"), period("2026-10-12", "2026-11-10")], TODAY);
    expect(e.status).toBe("SCHEDULED");
  });
});

describe("proposeStartDate", () => {
  it("active renewal starts the day after the current end (Oct 31 → Nov 29)", () => {
    const proposed = proposeStartDate([period("2026-10-01", "2026-10-30")], TODAY);
    expect(proposed).toEqual({ startDate: "2026-10-31", automatic: true });
    expect(membershipEndDate(proposed.startDate, 30)).toBe("2026-11-29");
  });

  it("extends after contiguous scheduled renewals without losing paid days", () => {
    const proposed = proposeStartDate([period("2026-10-01", "2026-10-30"), period("2026-10-31", "2026-11-29")], TODAY);
    expect(proposed).toEqual({ startDate: "2026-11-30", automatic: true });
  });

  it("expired renewal defaults to today (Oct 07 → Nov 05)", () => {
    const proposed = proposeStartDate([period("2026-09-01", "2026-09-30")], TODAY);
    expect(proposed).toEqual({ startDate: TODAY, automatic: false });
    expect(membershipEndDate(proposed.startDate, 30)).toBe("2026-11-05");
  });

  it("unpaid first purchase defaults to today and is editable", () => {
    expect(proposeStartDate([], TODAY)).toEqual({ startDate: TODAY, automatic: false });
  });

  it("scheduled member defaults to after the scheduled period", () => {
    expect(proposeStartDate([period("2026-10-12", "2026-11-10")], TODAY)).toEqual({
      startDate: "2026-11-11",
      automatic: false,
    });
  });
});

describe("findOverlap", () => {
  const scheduled = [period("2026-10-12", "2026-11-10")];
  it("detects a purchase overlapping a disconnected future period", () => {
    expect(findOverlap(scheduled, "2026-10-07", "2026-11-05")).toEqual(scheduled[0]);
  });
  it("allows a purchase that ends the day before", () => {
    expect(findOverlap(scheduled, "2026-10-07", "2026-10-11")).toBeNull();
  });
  it("allows a purchase starting the day after", () => {
    expect(findOverlap(scheduled, "2026-11-11", "2026-12-10")).toBeNull();
  });
});
