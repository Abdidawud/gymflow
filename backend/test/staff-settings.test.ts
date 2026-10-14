import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { ADMIN, multipart, RECEPTIONIST, useHarness } from "./helpers";

const h = useHarness();
beforeEach(() => h.reset());

describe("staff management", () => {
  it("creates staff with a temporary password that must be changed", async () => {
    const admin = await h.signIn(ADMIN);
    const res = await admin.post("/users", {
      fullName: "Meseret Alemu",
      email: "Meseret@AdamaFitness.com",
      role: "RECEPTIONIST",
      temporaryPassword: "Start#2026",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: "meseret@adamafitness.com",
      mustChangePassword: true,
      isActive: true,
    });
    expect(res.body).not.toHaveProperty("passwordHash");
    const duplicate = await admin.post("/users", {
      fullName: "Other",
      email: "meseret@adamafitness.com",
      role: "RECEPTIONIST",
      temporaryPassword: "Start#2026",
    });
    expect(duplicate.body.error.code).toBe("DUPLICATE_EMAIL");
    const login = await h.signIn({
      email: "meseret@adamafitness.com",
      password: "Start#2026",
    });
    expect((await login.get("/members")).body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("never removes the last active administrator", async () => {
    const admin = await h.signIn(ADMIN);
    const demote = await admin.patch(`/users/${ADMIN.id}`, {
      fullName: "Abdi Dawud",
      role: "RECEPTIONIST",
    });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe("LAST_ADMINISTRATOR");
    expect((await admin.post(`/users/${ADMIN.id}/deactivate`)).status).toBe(403);
  });

  it("keeps at least one administrator when two demote each other at the same time", async () => {
    // Without a super administrator, only the lock protects the last administrator.
    await h.owner.updateTable("staff").set({ is_super_admin: false }).execute();
    const abdi = await h.signIn(ADMIN);
    const promoted = await abdi.patch(`/users/${RECEPTIONIST.id}`, {
      fullName: "Tigist Haile",
      role: "ADMINISTRATOR",
    });
    expect(promoted.body.role).toBe("ADMINISTRATOR");
    const tigist = await h.signIn(RECEPTIONIST);
    const results = await Promise.all([
      abdi.patch(`/users/${RECEPTIONIST.id}`, {
        fullName: "Tigist Haile",
        role: "RECEPTIONIST",
      }),
      tigist.patch(`/users/${ADMIN.id}`, {
        fullName: "Abdi Dawud",
        role: "RECEPTIONIST",
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const admins = await h.owner
      .selectFrom("staff")
      .select("id")
      .where("role", "=", "ADMINISTRATOR")
      .where("is_active", "=", true)
      .execute();
    expect(admins).toHaveLength(1);
  });

  it("deactivation ends live sessions immediately", async () => {
    const desk = await h.signIn(RECEPTIONIST);
    const admin = await h.signIn(ADMIN);
    expect((await admin.post(`/users/${RECEPTIONIST.id}/deactivate`)).body.isActive).toBe(false);
    const res = await desk.get("/members");
    expect(res.status).toBe(401);
    expect((await admin.post(`/users/${RECEPTIONIST.id}/activate`)).body.isActive).toBe(true);
  });
});

describe("super administrator", () => {
  it("is reported on the account and listed first", async () => {
    const admin = await h.signIn(ADMIN);
    expect((await admin.get("/auth/me")).body.account.isSuperAdmin).toBe(true);
    const staff = (await admin.get("/users")).body;
    expect(staff[0]).toMatchObject({ id: ADMIN.id, isSuperAdmin: true });
  });

  it("can only be changed by its owner and always stays an active administrator", async () => {
    const abdi = await h.signIn(ADMIN);
    await abdi.patch(`/users/${RECEPTIONIST.id}`, { fullName: "Tigist Haile", role: "ADMINISTRATOR" });
    const tigist = await h.signIn(RECEPTIONIST);

    const rename = await tigist.patch(`/users/${ADMIN.id}`, { fullName: "Someone Else", role: "ADMINISTRATOR" });
    expect(rename.status).toBe(403);
    expect(rename.body.error.message).toBe("Only the super administrator can change this account.");
    expect((await tigist.post(`/users/${ADMIN.id}/deactivate`)).status).toBe(403);

    const selfDemote = await abdi.patch(`/users/${ADMIN.id}`, { fullName: "Abdi Dawud", role: "RECEPTIONIST" });
    expect(selfDemote.status).toBe(409);
    expect((await abdi.patch(`/users/${ADMIN.id}`, { fullName: "Abdi D.", role: "ADMINISTRATOR" })).body.fullName).toBe(
      "Abdi D.",
    );
    // The database refuses it too.
    await expect(
      h.owner.updateTable("staff").set({ is_active: false }).where("id", "=", ADMIN.id).execute(),
    ).rejects.toThrow(/staff_super_admin_active/);
  });
});

describe("gym settings", () => {
  it("validates and saves settings, recording who changed them", async () => {
    const admin = await h.signIn(ADMIN);
    const bad = await admin.patch("/settings", {
      expirationWarningDays: 31,
      enabledPaymentMethods: [],
    });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.body.error.fieldErrors).sort()).toEqual(["enabledPaymentMethods", "expirationWarningDays"]);
    const res = await admin.patch("/settings", {
      gymName: "Adama Fitness Center",
      phone: "022 111 8920",
      expirationWarningDays: 10,
    });
    expect(res.body).toMatchObject({
      gymName: "Adama Fitness Center",
      phone: "+251221118920",
      expirationWarningDays: 10,
      updatedBy: { id: ADMIN.id, fullName: "Abdi Dawud" },
    });
    // The warning window changes statuses immediately, without touching stored dates.
    const counts = (await admin.get("/dashboard")).body.counts;
    expect(counts.expiringSoon).toBeGreaterThan(20);
  });

  it("uploads a logo that receptionists can load on receipts", async () => {
    const admin = await h.signIn(ADMIN);
    const png = await sharp({
      create: { width: 300, height: 300, channels: 4, background: "#00000000" },
    })
      .png()
      .toBuffer();
    const res = await admin.request("POST", "/settings/logo", multipart("logo", "logo.png", "image/png", png));
    expect(res.body.logoUrl).toMatch(/^\/api\/v1\/settings\/logo\?v=\d+$/);
    const desk = await h.signIn(RECEPTIONIST);
    const logo = await desk.get("/settings/logo");
    expect(logo.headers["content-type"]).toBe("image/png");
    expect((await admin.patch("/settings", { logoUrl: null })).body.logoUrl).toBeNull();
    expect(
      (
        await admin.patch("/settings", {
          logoUrl: "https://evil.example/x.png",
        })
      ).status,
    ).toBe(422);
  });
});
