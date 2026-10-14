import { beforeAll, describe, expect, it } from "vitest";
import { ADMIN, RECEPTIONIST, useHarness } from "./helpers";

const h = useHarness();
beforeAll(() => h.reset());

describe("dashboard", () => {
  it("matches the design fixtures and uses the Ethiopian month", async () => {
    const admin = await h.signIn(ADMIN);
    const res = await admin.get("/dashboard");
    expect(res.body.counts).toEqual({
      all: 350,
      active: 306,
      expiringSoon: 20,
      expired: 35,
      scheduled: 1,
      unpaid: 8,
    });
    expect(res.body.expiringSoon).toHaveLength(5);
    expect(res.body.recentPayments).toHaveLength(5);
    // Meskerem 1, 2019 E.C. = Sep 11, 2026.
    expect(res.body.revenue.month).toMatchObject({
      from: "2026-09-11",
      to: "2026-10-07",
    });
    expect(res.body.revenue.today).toEqual({
      amount: "7500.00",
      transactions: 5,
    });
    expect(res.body.revenue.last30Days).toHaveLength(30);
  });

  it("hides gym-wide revenue from receptionists", async () => {
    const desk = await h.signIn(RECEPTIONIST);
    expect((await desk.get("/dashboard")).body.revenue).toBeNull();
  });
});

describe("reports", () => {
  it("totals revenue by received date with exact decimals and breakdowns", async () => {
    const admin = await h.signIn(ADMIN);
    const res = await admin.get(
      "/reports/revenue?from=2026-09-11&to=2026-10-07",
    );
    expect(res.status).toBe(200);
    const { totalRevenue, transactions, series, byPlan, byMethod } = res.body;
    expect(series).toHaveLength(27);
    const sumOf = (rows: { amount?: string; revenue?: string }[]) =>
      rows.reduce(
        (cents, row) =>
          cents + Math.round(Number(row.amount ?? row.revenue) * 100),
        0,
      );
    expect(sumOf(series)).toBe(Math.round(Number(totalRevenue) * 100));
    expect(sumOf(byPlan)).toBe(Math.round(Number(totalRevenue) * 100));
    expect(sumOf(byMethod)).toBe(Math.round(Number(totalRevenue) * 100));
    expect(
      byMethod.reduce(
        (n: number, row: { transactions: number }) => n + row.transactions,
        0,
      ),
    ).toBe(transactions);
  });

  it("returns zeros for a range without payments", async () => {
    const admin = await h.signIn(ADMIN);
    const res = await admin.get(
      "/reports/revenue?from=2024-01-01&to=2024-01-31",
    );
    expect(res.body).toMatchObject({
      totalRevenue: "0.00",
      transactions: 0,
      averagePayment: "0.00",
      byPlan: [],
      byMethod: [],
    });
  });

  it("validates ranges", async () => {
    const admin = await h.signIn(ADMIN);
    expect(
      (await admin.get("/reports/revenue?from=2026-10-07&to=2026-10-01")).body
        .error.fieldErrors.from,
    ).toBe("The From date must be on or before the To date.");
    expect(
      (await admin.get("/reports/revenue?from=2025-01-01&to=2026-10-07"))
        .status,
    ).toBe(422);
  });

  it("separates renewals from first purchases and reports current counts as of today", async () => {
    const admin = await h.signIn(ADMIN);
    const res = await admin.get(
      "/reports/memberships?from=2026-09-11&to=2026-10-07",
    );
    expect(res.body.current).toMatchObject({
      asOf: "2026-10-07",
      active: 306,
      expiringSoon: 20,
      expired: 35,
      unpaid: 8,
      scheduled: 1,
    });
    expect(res.body.renewals + res.body.firstPurchases).toBeGreaterThan(0);
  });
});

describe("plans", () => {
  it("shows reception only purchasable plans and counts current members", async () => {
    const desk = await h.signIn(RECEPTIONIST);
    const plans = (await desk.get("/plans?includeDisabled=true")).body;
    expect(plans.every((p: { isEnabled: boolean }) => p.isEnabled)).toBe(true);
    const admin = await h.signIn(ADMIN);
    const all = (await admin.get("/plans?includeDisabled=true")).body;
    expect(all).toHaveLength(7);
    expect(
      all.find((p: { name: string }) => p.name === "Monthly").activeMemberCount,
    ).toBeGreaterThan(100);
    const duplicate = await admin.post("/plans", {
      name: "monthly",
      price: "10",
      durationDays: 30,
      description: null,
      isEnabled: true,
    });
    expect(duplicate.body.error.code).toBe("DUPLICATE_PLAN_NAME");
  });
});

describe("operations", () => {
  it("reports readiness and adds security headers", async () => {
    const res = await h.client().get("/ready");
    expect(res.body).toEqual({ status: "ready" });
    expect(res.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "cache-control": "no-store",
    });
    expect(res.headers["x-request-id"]).toBeTruthy();
    const missing = await h.client().get("/does-not-exist");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });
});
