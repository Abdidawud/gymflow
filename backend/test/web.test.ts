/**
 * The in-process adapter the web app uses on Vercel: standard Request in,
 * Response out, through the full API (cookies, CSRF, uploads, errors).
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo } from "../src/cli";
import { createDb, createPool } from "../src/db";
import { loadTestEnv } from "./env";
import { ADMIN, ORIGIN, TODAY } from "./helpers";

let handleApiRequest: typeof import("../src/web").handleApiRequest;
const deferred: (() => Promise<unknown>)[] = [];

beforeAll(async () => {
  const { appUrl, ownerUrl } = loadTestEnv();
  const owner = createDb(createPool({ url: ownerUrl, poolMax: 1 }));
  await seedDemo(owner, { reset: true });
  await owner.destroy();
  Object.assign(process.env, {
    APP_ENV: "test",
    DATABASE_URL: appUrl,
    APP_ORIGIN: ORIGIN,
    SESSION_SECRET: "web-adapter-tests-secret-value-with-32-plus-chars",
    FIXED_TODAY: TODAY,
    MAIL_TRANSPORT: "log",
    LOG_LEVEL: "silent",
    CRON_SECRET: "cron-secret-for-tests-1234",
  });
  ({ handleApiRequest } = await import("../src/web"));
});

afterAll(() => {
  delete process.env.CRON_SECRET;
});

const api = (path: string, init: RequestInit = {}) =>
  handleApiRequest(new Request(`${ORIGIN}/api/v1${path}`, init), { after: (task) => deferred.push(task) });

describe("web adapter", () => {
  it("signs in with cookies and serves authenticated requests", async () => {
    const login = await api("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "accept-language": "en" },
      body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
    });
    expect(login.status).toBe(200);
    const cookies = login.headers.getSetCookie();
    expect(cookies.map((c) => c.split("=")[0]).sort()).toEqual(["gf_csrf", "gf_session"]);
    const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
    const csrf = cookies
      .find((c) => c.startsWith("gf_csrf="))!
      .split(";")[0]
      .slice("gf_csrf=".length);

    const me = await api("/auth/me", { headers: { cookie } });
    expect(((await me.json()) as any).account.email).toBe(ADMIN.email);
    expect(me.headers.get("x-request-id")).toBeTruthy();

    const prefs = await api("/account/preferences", {
      method: "PATCH",
      headers: { cookie, origin: ORIGIN, "x-csrf-token": csrf, "content-type": "application/json" },
      body: JSON.stringify({ appearance: "DARK" }),
    });
    expect(prefs.status).toBe(200);

    const logout = await api("/auth/logout", { method: "POST", headers: { cookie, origin: ORIGIN } });
    expect(logout.status).toBe(204);
    expect(await logout.text()).toBe("");
  });

  it("runs deferred work through the platform's after() hook", async () => {
    deferred.length = 0;
    const res = await api("/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email: ADMIN.email }),
    });
    expect(res.status).toBe(204);
    expect(deferred).toHaveLength(1);
  });

  it("protects the cron route with the shared secret", async () => {
    expect((await api("/internal/cron")).status).toBe(404);
    const res = await api("/internal/cron", { headers: { authorization: "Bearer cron-secret-for-tests-1234" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ cleanup: true });
  });

  it("reports readiness for the current schema", async () => {
    expect(await (await api("/ready")).json()).toEqual({ status: "ready" });
  });
});
