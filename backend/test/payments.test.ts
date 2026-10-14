import { randomUUID } from "node:crypto";
import { demoId } from "@gymflow/shared/demo/ids";
import { sql } from "kysely";
import { beforeEach, describe, expect, it } from "vitest";
import { ADMIN, MEMBERS, RECEPTIONIST, useHarness, type TestClient } from "./helpers";

const h = useHarness();
const MONTHLY = demoId("plan", 3); // 1500.00 ETB, 30 days
const WEEKLY = demoId("plan", 2); // 500.00 ETB, 7 days
const STUDENT = demoId("plan", 7); // disabled

async function preview(client: TestClient, memberId: string, planId = MONTHLY, requestedStartDate?: string) {
  return client.post("/payments/preview", {
    memberId,
    planId,
    ...(requestedStartDate ? { requestedStartDate } : {}),
  });
}

async function record(
  client: TestClient,
  memberId: string,
  options: {
    planId?: string;
    start?: string;
    method?: string;
    reference?: string | null;
    key?: string;
    receivedDate?: string;
  } = {},
) {
  const p = await preview(client, memberId, options.planId ?? MONTHLY, options.start);
  if (p.status !== 200) return p;
  return client.post(
    "/payments",
    {
      memberId,
      planId: options.planId ?? MONTHLY,
      paymentMethod: options.method ?? "CASH",
      receivedDate: options.receivedDate ?? "2026-10-07",
      ...(options.start ? { requestedStartDate: options.start } : {}),
      reference: options.reference ?? null,
      notes: null,
      previewFingerprint: p.body.previewFingerprint,
    },
    { "idempotency-key": options.key ?? randomUUID() },
  );
}

/** The fields the plan form sends (PlanInput). */
function planInput(plan: {
  name: string;
  price: string;
  durationDays: number;
  description: string | null;
  isEnabled: boolean;
}) {
  return {
    name: plan.name,
    price: plan.price,
    durationDays: plan.durationDays,
    description: plan.description,
    isEnabled: plan.isEnabled,
  };
}

async function count(table: "payments" | "memberships" | "audit_events") {
  const row = await h.owner
    .selectFrom(table)
    .select(sql<string>`count(*)`.as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

beforeEach(() => h.reset());

describe("membership dates (backend design §5)", () => {
  it("renews an active member right after current coverage: Oct 31 – Nov 29", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const p = await preview(client, MEMBERS.abebe);
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({
      startDate: "2026-10-31",
      endDate: "2026-11-29",
      startIsAutomatic: true,
      isRenewal: true,
      amount: "1500.00",
      currency: "ETB",
    });
    const res = await record(client, MEMBERS.abebe);
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({
      amount: "1500.00",
      method: "CASH",
      receivedDate: "2026-10-07",
      membership: {
        startDate: "2026-10-31",
        endDate: "2026-11-29",
        isRenewal: true,
        planName: "Monthly",
      },
      recordedBy: { id: RECEPTIONIST.id, fullName: "Tigist Haile" },
    });
    expect(res.body.payment.paymentCode).toBe("PAY-10299");
  });

  it("starts an expired member today: Oct 7 – Nov 5", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const p = await preview(client, MEMBERS.dawit);
    expect(p.body).toMatchObject({
      startDate: "2026-10-07",
      endDate: "2026-11-05",
      startIsAutomatic: false,
      minStartDate: "2026-10-07",
    });
  });

  it("schedules a future first purchase: Oct 12 – Nov 10, shown as Scheduled", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const res = await record(client, MEMBERS.sara, { start: "2026-10-12" });
    expect(res.status).toBe(201);
    expect(res.body.payment.membership).toMatchObject({
      startDate: "2026-10-12",
      endDate: "2026-11-10",
      isRenewal: false,
    });
    const member = await client.get(`/members/${MEMBERS.sara}`);
    expect(member.body.membership).toMatchObject({
      status: "SCHEDULED",
      daysUntilStart: 5,
    });
  });

  it("refuses backdated and far-future starts", async () => {
    const client = await h.signIn(RECEPTIONIST);
    expect((await preview(client, MEMBERS.dawit, MONTHLY, "2026-10-06")).body.error.fieldErrors).toHaveProperty(
      "requestedStartDate",
    );
    expect((await preview(client, MEMBERS.dawit, MONTHLY, "2027-12-01")).status).toBe(422);
  });

  it("rejects a purchase overlapping disconnected future coverage, writing nothing", async () => {
    const client = await h.signIn(RECEPTIONIST);
    // Meron is scheduled from Oct 12; a monthly plan from today would overlap it.
    const before = await count("payments");
    const res = await preview(client, MEMBERS.meron, MONTHLY, "2026-10-07");
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("DATE_CONFLICT");
    expect(res.body.error.details).toMatchObject({
      conflictStart: "2026-10-12",
    });
    // Messages show Ethiopian dates.
    expect(res.body.error.message).toContain("Tekemt 2, 2019");
    expect(await count("payments")).toBe(before);
  });
});

describe("recording payments (backend design §10)", () => {
  it("records exactly once for a repeated operation key and replays the original result", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const key = randomUUID();
    const p = await preview(client, MEMBERS.dawit);
    const body = {
      memberId: MEMBERS.dawit,
      planId: MONTHLY,
      paymentMethod: "BANK_TRANSFER",
      receivedDate: "2026-10-07",
      reference: "FT2628012345",
      notes: null,
      previewFingerprint: p.body.previewFingerprint,
    };
    const before = await count("payments");
    const first = await client.post("/payments", body, {
      "idempotency-key": key,
    });
    expect(first.status).toBe(201);
    // A lost response is retried with the same key: same payment, nothing new written.
    const retry = await client.post("/payments", body, {
      "idempotency-key": key,
    });
    expect(retry.status).toBe(200);
    expect(retry.body.payment.id).toBe(first.body.payment.id);
    expect(await count("payments")).toBe(before + 1);

    const changed = await client.post("/payments", { ...body, reference: "FT9999999999" }, { "idempotency-key": key });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await count("payments")).toBe(before + 1);
  });

  it("serializes concurrent retries of the same key into one payment", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const key = randomUUID();
    const p = await preview(client, MEMBERS.dawit);
    const body = {
      memberId: MEMBERS.dawit,
      planId: MONTHLY,
      paymentMethod: "CASH",
      receivedDate: "2026-10-07",
      reference: null,
      notes: null,
      previewFingerprint: p.body.previewFingerprint,
    };
    const before = await count("payments");
    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.post("/payments", body, { "idempotency-key": key })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.payment.id)).size).toBe(1);
    expect(await count("payments")).toBe(before + 1);
  });

  it("lets only one of two concurrent renewals through; the other must review a new preview", async () => {
    const desk = await h.signIn(RECEPTIONIST);
    const office = await h.signIn(ADMIN);
    const [a, b] = await Promise.all([preview(desk, MEMBERS.abebe), preview(office, MEMBERS.abebe)]);
    expect(a.body.previewFingerprint).toBe(b.body.previewFingerprint);
    const body = (fp: string) => ({
      memberId: MEMBERS.abebe,
      planId: MONTHLY,
      paymentMethod: "CASH",
      receivedDate: "2026-10-07",
      reference: null,
      notes: null,
      previewFingerprint: fp,
    });
    const results = await Promise.all([
      desk.post("/payments", body(a.body.previewFingerprint), {
        "idempotency-key": randomUUID(),
      }),
      office.post("/payments", body(b.body.previewFingerprint), {
        "idempotency-key": randomUUID(),
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe("STALE_PREVIEW");
    const periods = await h.owner
      .selectFrom("memberships")
      .select(["start_date", "end_date"])
      .where("member_id", "=", MEMBERS.abebe)
      .where("start_date", ">", "2026-10-07")
      .execute();
    expect(periods).toEqual([{ start_date: "2026-10-31", end_date: "2026-11-29" }]);
  });

  it("asks for a new review when the price changed after the preview", async () => {
    const client = await h.signIn(ADMIN);
    const p = await preview(client, MEMBERS.dawit);
    const plan = (await client.get("/plans")).body.find((x: { id: string }) => x.id === MONTHLY);
    expect(
      (
        await client.patch(`/plans/${MONTHLY}`, {
          ...planInput(plan),
          price: "1600.00",
        })
      ).status,
    ).toBe(200);
    const res = await client.post(
      "/payments",
      {
        memberId: MEMBERS.dawit,
        planId: MONTHLY,
        paymentMethod: "CASH",
        receivedDate: "2026-10-07",
        reference: null,
        notes: null,
        previewFingerprint: p.body.previewFingerprint,
      },
      { "idempotency-key": randomUUID() },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STALE_PREVIEW");
  });

  it("takes the amount from the plan, never from the request", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const p = await preview(client, MEMBERS.dawit);
    const res = await client.post(
      "/payments",
      {
        memberId: MEMBERS.dawit,
        planId: MONTHLY,
        paymentMethod: "CASH",
        receivedDate: "2026-10-07",
        reference: null,
        notes: null,
        previewFingerprint: p.body.previewFingerprint,
        amount: "1.00",
      },
      { "idempotency-key": randomUUID() },
    );
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("amount");
  });

  it("validates method, reference and received date", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const noReference = await record(client, MEMBERS.dawit, {
      method: "MOBILE_PAYMENT",
    });
    expect(noReference.status).toBe(422);
    expect(noReference.body.error.fieldErrors).toHaveProperty("reference");
    const future = await record(client, MEMBERS.dawit, {
      receivedDate: "2026-10-08",
    });
    expect(future.body.error.fieldErrors.receivedDate).toBe("Payment date can't be in the future.");
    const backEntered = await record(client, MEMBERS.dawit, {
      receivedDate: "2026-10-02",
    });
    expect(backEntered.status).toBe(201);
  });

  it("requires a UUID Idempotency-Key", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const res = await client.post("/payments", {
      memberId: MEMBERS.dawit,
      planId: MONTHLY,
      paymentMethod: "CASH",
      receivedDate: "2026-10-07",
      reference: null,
      notes: null,
      previewFingerprint: "x",
    });
    expect(res.status).toBe(400);
  });

  it("refuses disabled plans and methods, and archived members", async () => {
    const admin = await h.signIn(ADMIN);
    expect((await preview(admin, MEMBERS.dawit, STUDENT)).body.error.code).toBe("PLAN_DISABLED");

    await admin.patch("/settings", { enabledPaymentMethods: ["CASH"] });
    const card = await record(admin, MEMBERS.dawit, {
      method: "CARD",
      reference: "POS-123456",
    });
    expect(card.body.error.code).toBe("PAYMENT_METHOD_DISABLED");

    await admin.post(`/members/${MEMBERS.dawit}/archive`);
    expect((await preview(admin, MEMBERS.dawit)).body.error.code).toBe("MEMBER_ARCHIVED");
  });

  it("writes the period, the payment and an audit event together", async () => {
    const client = await h.signIn(RECEPTIONIST);
    const before = {
      payments: await count("payments"),
      memberships: await count("memberships"),
      audit: await count("audit_events"),
    };
    expect((await record(client, MEMBERS.sara, { planId: WEEKLY })).status).toBe(201);
    expect(await count("payments")).toBe(before.payments + 1);
    expect(await count("memberships")).toBe(before.memberships + 1);
    expect(await count("audit_events")).toBe(before.audit + 1);
    const event = await h.owner.selectFrom("audit_events").selectAll().orderBy("id", "desc").executeTakeFirstOrThrow();
    expect(event).toMatchObject({
      action: "payment.create",
      actor_id: RECEPTIONIST.id,
      entity_type: "payment",
    });
  });
});

describe("financial history", () => {
  it("keeps purchase-time plan details after a plan is renamed and repriced", async () => {
    const admin = await h.signIn(ADMIN);
    const paid = await record(admin, MEMBERS.dawit);
    const plan = (await admin.get("/plans")).body.find((x: { id: string }) => x.id === MONTHLY);
    const renamed = await admin.patch(`/plans/${MONTHLY}`, {
      ...planInput(plan),
      name: "Monthly Plus",
      price: "1800.00",
    });
    expect(renamed.body).toMatchObject({
      name: "Monthly Plus",
      price: "1800.00",
      isReferenced: true,
    });
    const receipt = await admin.get(`/payments/${paid.body.payment.id}/receipt`);
    expect(receipt.body.payment.membership).toMatchObject({
      planName: "Monthly",
      price: "1500.00",
      durationDays: 30,
    });
    expect(receipt.body.gym).toMatchObject({
      name: "Adama Fitness",
      phone: "+251221118920",
    });
  });

  it("cannot be edited or deleted, even by the application role", async () => {
    const payment = await h.appDb.selectFrom("payments").select("id").executeTakeFirstOrThrow();
    await expect(
      h.appDb.updateTable("payments").set({ notes: "edited" }).where("id", "=", payment.id).execute(),
    ).rejects.toThrow(/permission denied/);
    await expect(h.appDb.deleteFrom("memberships").execute()).rejects.toThrow(/permission denied/);
    // Even the schema owner is stopped by the immutability trigger.
    await expect(
      h.owner.updateTable("payments").set({ notes: "edited" }).where("id", "=", payment.id).execute(),
    ).rejects.toThrow(/immutable/);
  });

  it("blocks overlapping coverage at the database level", async () => {
    const plan = await h.owner
      .selectFrom("plans")
      .select(["id", "name", "price"])
      .where("id", "=", MONTHLY)
      .executeTakeFirstOrThrow();
    await expect(
      h.owner
        .insertInto("memberships")
        .values({
          member_id: MEMBERS.abebe,
          plan_id: plan.id,
          plan_name_snapshot: plan.name,
          price_snapshot: plan.price,
          duration_days_snapshot: 30,
          start_date: "2026-10-15",
          end_date: "2026-11-13",
          is_renewal: true,
        })
        .execute(),
    ).rejects.toThrow(/memberships_no_overlap/);
  });
});

describe("payment lists", () => {
  it("searches by payment number, member and reference, with revenue for administrators only", async () => {
    const admin = await h.signIn(ADMIN);
    const byCode = await admin.get("/payments?search=PAY-10234");
    expect(byCode.body.items.map((p: { paymentCode: string }) => p.paymentCode)).toEqual(["PAY-10234"]);
    const byMember = await admin.get("/payments?search=abebe%20kebede&pageSize=100");
    expect(
      byMember.body.items.every((p: { member: { fullName: string } }) => p.member.fullName === "Abebe Kebede"),
    ).toBe(true);
    const october = await admin.get("/payments?from=2026-10-07&to=2026-10-07");
    expect(october.body.summary).toEqual({
      totalRevenue: "7500.00",
      transactions: 5,
    });

    const desk = await h.signIn(RECEPTIONIST);
    expect((await desk.get("/payments?from=2026-10-07&to=2026-10-07")).body.summary).toBeNull();
  });
});
