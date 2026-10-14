import { describe, expect, it } from "vitest";
import { ADMIN, DEACTIVATED, RECEPTIONIST, TEMPORARY, useHarness } from "./helpers";

const h = useHarness();

describe("sign-in", () => {
  it("returns the account, permissions and gym context, with secure cookies", async () => {
    const client = h.client();
    const res = await client.post("/auth/login", {
      email: " ABDI@adamafitness.com ",
      password: ADMIN.password,
    });
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({
      email: ADMIN.email,
      role: "ADMINISTRATOR",
      mustChangePassword: false,
    });
    expect(res.body.account.permissions).toContain("reports.view");
    expect(res.body.gym).toMatchObject({
      name: "Adama Fitness",
      today: "2026-10-07",
      currency: "ETB",
      hasPlans: true,
    });
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toMatch(/gf_session=[^;]+;.*HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(client.csrf).toBeTruthy();
  });

  it("answers wrong credentials generically, in the requested language", async () => {
    const en = await h.client("en").post("/auth/login", {
      email: ADMIN.email,
      password: "wrong-password-1",
    });
    expect(en.status).toBe(401);
    expect(en.body.error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "Email or password is incorrect.",
    });
    expect(en.body.error.requestId).toBeTruthy();
    const unknown = await h.client("am").post("/auth/login", {
      email: "nobody@example.com",
      password: "whatever-1",
    });
    expect(unknown.body.error).toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "ኢሜይል ወይም የይለፍ ቃል ትክክል አይደለም።",
    });
  });

  it("locks an email after repeated failures", async () => {
    const email = "lockout-test@example.com";
    for (let i = 0; i < 5; i++) {
      expect((await h.client().post("/auth/login", { email, password: `nope-${i}` })).status).toBe(401);
    }
    const res = await h.client().post("/auth/login", { email, password: "nope-again" });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });

  it("refuses deactivated accounts", async () => {
    const res = await h.client().post("/auth/login", {
      email: DEACTIVATED.email,
      password: DEACTIVATED.password,
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("ACCOUNT_DEACTIVATED");
  });

  it("rejects unknown fields and malformed bodies", async () => {
    const extra = await h.client().post("/auth/login", { ...ADMIN, remember: true });
    expect(extra.status).toBe(400);
    expect(extra.body.error.fieldErrors).toHaveProperty("remember");
    const garbled = await h.client().request("POST", "/auth/login", {
      payload: "{not json",
      headers: { "content-type": "application/json" },
    });
    expect(garbled.status).toBe(400);
    expect(garbled.body.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("sessions", () => {
  it("requires a session everywhere except public routes", async () => {
    const res = await h.client().get("/members");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect((await h.client().get("/health")).status).toBe(200);
  });

  it("expires idle sessions", async () => {
    const client = await h.signIn(ADMIN);
    await h.owner
      .updateTable("sessions")
      .set({ last_seen_at: new Date(Date.now() - 31 * 60_000) })
      .where("staff_id", "=", ADMIN.id)
      .execute();
    const res = await client.get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("ends the session on sign-out", async () => {
    const client = await h.signIn(RECEPTIONIST);
    expect((await client.post("/auth/logout")).status).toBe(204);
    expect((await client.get("/auth/me")).status).toBe(401);
  });

  it("requires the CSRF token on writes and refuses foreign origins", async () => {
    const client = await h.signIn(ADMIN);
    const noToken = await client.request("PATCH", "/account/preferences", {
      body: { appearance: "DARK" },
      csrf: false,
    });
    expect(noToken.status).toBe(403);
    const forged = await client.request("PATCH", "/account/preferences", {
      body: { appearance: "DARK" },
      headers: { "x-csrf-token": "forged" },
    });
    expect(forged.status).toBe(403);
    const foreign = await client.request("PATCH", "/account/preferences", {
      body: { appearance: "DARK" },
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
    expect((await client.patch("/account/preferences", { appearance: "DARK" })).status).toBe(200);
  });

  it("denies administrator endpoints to receptionists even if the UI is bypassed", async () => {
    const client = await h.signIn(RECEPTIONIST);
    for (const url of ["/reports/revenue?from=2026-10-01&to=2026-10-07", "/users", "/settings"]) {
      const res = await client.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    }
    expect(
      (
        await client.post("/plans", {
          name: "X",
          price: "1",
          durationDays: 1,
          description: null,
          isEnabled: true,
        })
      ).status,
    ).toBe(403);
  });
});

describe("temporary passwords", () => {
  it("allow only the password change until it is done", async () => {
    await h.reset();
    const client = await h.signIn(TEMPORARY);
    const me = await client.get("/auth/me");
    expect(me.body.account.mustChangePassword).toBe(true);
    const blocked = await client.get("/members");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const weak = await client.post("/account/change-password", {
      currentPassword: TEMPORARY.password,
      newPassword: "short",
    });
    expect(weak.status).toBe(422);
    expect(weak.body.error.fieldErrors).toHaveProperty("newPassword");
    const wrong = await client.post("/account/change-password", {
      currentPassword: "nope",
      newPassword: "Selam#2026x",
    });
    expect(wrong.body.error.code).toBe("INVALID_CURRENT_PASSWORD");

    expect(
      (
        await client.post("/account/change-password", {
          currentPassword: TEMPORARY.password,
          newPassword: "Selam#2026x",
        })
      ).status,
    ).toBe(204);
    expect((await client.get("/members")).status).toBe(200);
  });

  it("signs other devices out after a password change", async () => {
    await h.reset();
    const phone = await h.signIn(ADMIN);
    const desk = await h.signIn(ADMIN);
    expect(
      (
        await desk.post("/account/change-password", {
          currentPassword: ADMIN.password,
          newPassword: "NewSecret#2026",
        })
      ).status,
    ).toBe(204);
    expect((await desk.get("/auth/me")).status).toBe(200);
    expect((await phone.get("/auth/me")).status).toBe(401);
  });
});

describe("password recovery", () => {
  async function latestResetLink() {
    const mail = await h.owner
      .selectFrom("email_outbox")
      .select(["recipient", "subject", "body_text"])
      .orderBy("id", "desc")
      .executeTakeFirstOrThrow();
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.body_text ?? "")?.[1];
    return { mail, token: decodeURIComponent(token ?? "") };
  }

  it("answers the same whether or not the account exists", async () => {
    await h.reset();
    const before = await h.owner.selectFrom("email_outbox").select("id").execute();
    expect((await h.client().post("/auth/forgot-password", { email: "nobody@example.com" })).status).toBe(204);
    expect(await h.owner.selectFrom("email_outbox").select("id").execute()).toHaveLength(before.length);
    expect((await h.client().post("/auth/forgot-password", { email: ADMIN.email })).status).toBe(204);
    const { mail } = await latestResetLink();
    // The email is in the staff member's own language (Amharic for the demo staff).
    expect(mail).toMatchObject({
      recipient: ADMIN.email,
      subject: "የGymFlow የይለፍ ቃልዎን ይቀይሩ",
    });
    expect(mail.body_text).toContain("http://localhost:3000/reset-password?token=");
  });

  it("delivers the email right after the response and erases its body", async () => {
    await h.reset();
    h.sentMail.length = 0;
    await h.client().post("/auth/forgot-password", { email: RECEPTIONIST.email });
    await h.runDeferred();
    expect(h.sentMail).toHaveLength(1);
    expect(h.sentMail[0]).toMatchObject({ to: RECEPTIONIST.email });
    expect(h.sentMail[0].text).toContain("/reset-password?token=");
    const row = await h.owner.selectFrom("email_outbox").select(["sent_at", "body_text"]).executeTakeFirstOrThrow();
    expect(row.sent_at).not.toBeNull();
    expect(row.body_text).toBeNull();
  });

  it("resets once, revokes sessions and stores only a digest of the token", async () => {
    await h.reset();
    const signedIn = await h.signIn(ADMIN);
    await h.client().post("/auth/forgot-password", { email: ADMIN.email });
    const { token } = await latestResetLink();
    const stored = await h.owner.selectFrom("password_resets").select("token_hash").executeTakeFirstOrThrow();
    expect(stored.token_hash.toString("base64url")).not.toBe(token);

    const reset = await h.client().post("/auth/reset-password", { token, newPassword: "Recovered#2026" });
    expect(reset.status).toBe(204);
    expect((await signedIn.get("/auth/me")).status).toBe(401);
    expect(
      (
        await h.client().post("/auth/login", {
          email: ADMIN.email,
          password: "Recovered#2026",
        })
      ).status,
    ).toBe(200);

    const reused = await h.client().post("/auth/reset-password", { token, newPassword: "Another#2026" });
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe("INVALID_RESET_TOKEN");
  });

  it("rejects expired links without changing the password", async () => {
    await h.reset();
    await h.client().post("/auth/forgot-password", { email: RECEPTIONIST.email });
    const { token } = await latestResetLink();
    await h.owner
      .updateTable("password_resets")
      .set({
        expires_at: new Date(Date.now() - 1000),
        created_at: new Date(Date.now() - 60_000),
      })
      .execute();
    const res = await h.client().post("/auth/reset-password", { token, newPassword: "Expired#2026" });
    expect(res.body.error.code).toBe("INVALID_RESET_TOKEN");
    expect(
      (
        await h.client().post("/auth/login", {
          email: RECEPTIONIST.email,
          password: RECEPTIONIST.password,
        })
      ).status,
    ).toBe(200);
  });
});

describe("preferences", () => {
  it("saves appearance and language to the account", async () => {
    await h.reset();
    const client = await h.signIn(RECEPTIONIST);
    const res = await client.patch("/account/preferences", {
      language: "en",
      appearance: "DARK",
    });
    expect(res.body).toMatchObject({ language: "en", appearance: "DARK" });
    expect((await client.get("/auth/me")).body.account).toMatchObject({
      language: "en",
      appearance: "DARK",
    });
    const bad = await client.patch("/account/preferences", { language: "fr" });
    expect(bad.status).toBe(422);
    expect(bad.body.error.fieldErrors).toHaveProperty("language");
  });
});
