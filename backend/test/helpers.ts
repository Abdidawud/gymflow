/**
 * Test harness: the real app (all plugins, hooks and SQL) on the test
 * database, connected as the least-privileged application role, plus an
 * owner connection for resetting data and inspecting tables.
 */

import type { FastifyInstance } from "fastify";
import { DEMO_STAFF_IDS, demoMemberId } from "@gymflow/shared/demo/ids";
import { DEMO_PASSWORD } from "@gymflow/shared/demo/seed";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../src/app";
import { seedDemo } from "../src/cli";
import { loadConfig } from "../src/config";
import { createDb, createPool, type Db } from "../src/db";
import { createClock } from "../src/lib/clock";
import { FileStorage } from "../src/services/storage";
import { loadTestEnv } from "./env";

export const TODAY = "2026-10-07";
export const ORIGIN = "http://localhost:3000";
export const ADMIN = {
  email: "abdi@adamafitness.com",
  password: DEMO_PASSWORD,
  id: DEMO_STAFF_IDS.abdi,
};
export const RECEPTIONIST = {
  email: "tigist@adamafitness.com",
  password: DEMO_PASSWORD,
  id: DEMO_STAFF_IDS.tigist,
};
export const TEMPORARY = {
  email: "selam@adamafitness.com",
  password: "Welcome#2026",
  id: DEMO_STAFF_IDS.selam,
};
export const DEACTIVATED = {
  email: "dawit.t@adamafitness.com",
  password: DEMO_PASSWORD,
  id: DEMO_STAFF_IDS.dawit,
};

/** Demo members from the design fixtures. */
export const MEMBERS = {
  abebe: demoMemberId(124), // Active, Oct 01 – Oct 30 (23 days left)
  hana: demoMemberId(125), // Expiring soon (3 days left)
  dawit: demoMemberId(126), // Expired Sep 30
  sara: demoMemberId(127), // Unpaid
  meron: demoMemberId(128), // Scheduled from Oct 12
};

export interface Harness {
  app: FastifyInstance;
  /** Owner connection: resets and inspection, bypassing the app role's limits. */
  owner: Db;
  /** Application-role connection, exactly what the API uses. */
  appDb: Db;
  reset(): Promise<void>;
  /** Emails "sent" by the capturing mail transport. */
  sentMail: { to: string; subject: string; text: string }[];
  /** Work the API deferred until after its responses; run it with runDeferred(). */
  runDeferred(): Promise<void>;
  client(locale?: "am" | "en"): TestClient;
  signIn(user: { email: string; password: string }, locale?: "am" | "en"): Promise<TestClient>;
}

export function useHarness(options: { env?: Record<string, string> } = {}): Harness {
  const harness = { sentMail: [] } as unknown as Harness;
  const deferred: (() => Promise<unknown>)[] = [];
  harness.runDeferred = async () => {
    for (const task of deferred.splice(0)) await task();
  };
  let ownerPool: ReturnType<typeof createPool>;
  let appPool: ReturnType<typeof createPool>;

  beforeAll(async () => {
    const { appUrl, ownerUrl } = loadTestEnv();
    const config = loadConfig({
      NODE_ENV: "test",
      DATABASE_URL: appUrl,
      APP_ORIGIN: ORIGIN,
      SESSION_SECRET: "integration-tests-secret-value-with-32-plus-chars",
      FIXED_TODAY: TODAY,
      MAIL_TRANSPORT: "log",
      LOG_LEVEL: "silent",
      AUTH_RATE_LIMIT_PER_MINUTE: "10000",
      ...options.env,
    });
    ownerPool = createPool({ url: ownerUrl, poolMax: 2 });
    appPool = createPool({ url: appUrl, poolMax: 10 });
    harness.owner = createDb(ownerPool);
    harness.appDb = createDb(appPool);
    harness.app = await buildApp(
      {
        config,
        db: harness.appDb,
        pool: appPool,
        clock: createClock(TODAY),
        storage: new FileStorage(),
        mail: {
          async send(message) {
            harness.sentMail.push({ to: message.to, subject: message.subject, text: message.text });
          },
        },
        defer: (task) => {
          deferred.push(task);
        },
      },
      { logger: process.env.TEST_LOG ? { level: "error" } : false },
    );
    harness.reset = () => seedDemo(harness.owner, { reset: true });
    harness.client = (locale = "en") => new TestClient(harness.app, locale);
    harness.signIn = async (user, locale = "en") => {
      const client = new TestClient(harness.app, locale);
      const res = await client.post("/auth/login", {
        email: user.email,
        password: user.password,
      });
      if (res.status !== 200)
        throw new Error(`sign-in failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
      return client;
    };
    await harness.reset();
  });

  afterAll(async () => {
    await harness.app?.close();
    await harness.appDb?.destroy();
    await harness.owner?.destroy();
  });

  return harness;
}

export interface TestResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | number | undefined>;
}

/** A browser-like client: keeps cookies and echoes the CSRF token like the web app. */
export class TestClient {
  readonly cookies = new Map<string, string>();

  constructor(
    private readonly app: FastifyInstance,
    private readonly locale: "am" | "en",
  ) {}

  get csrf(): string | undefined {
    return this.cookies.get("gf_csrf");
  }

  async request<T = any>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      payload?: Buffer | string;
      csrf?: boolean;
    } = {},
  ): Promise<TestResponse<T>> {
    const headers: Record<string, string> = {
      "accept-language": this.locale,
      origin: ORIGIN,
      ...(this.cookies.size ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      ...(options.csrf !== false && this.csrf && method !== "GET" ? { "x-csrf-token": this.csrf } : {}),
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...options.headers,
    };
    const res = await this.app.inject({
      method,
      url: `/api/v1${url}`,
      headers,
      payload: options.body !== undefined ? JSON.stringify(options.body) : options.payload,
    });
    for (const cookie of res.cookies as {
      name: string;
      value: string;
      expires?: Date;
    }[]) {
      const expired = cookie.value === "" || (cookie.expires && cookie.expires.getTime() < Date.now());
      if (expired) this.cookies.delete(cookie.name);
      else this.cookies.set(cookie.name, cookie.value);
    }
    let body: unknown = null;
    if (res.body && String(res.headers["content-type"] ?? "").includes("json")) body = JSON.parse(res.body);
    else if (res.body) body = res.rawPayload;
    return { status: res.statusCode, body: body as T, headers: res.headers };
  }

  get<T = any>(url: string) {
    return this.request<T>("GET", url);
  }
  post<T = any>(url: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>("POST", url, { body, headers });
  }
  patch<T = any>(url: string, body?: unknown) {
    return this.request<T>("PATCH", url, { body });
  }
  delete<T = any>(url: string) {
    return this.request<T>("DELETE", url);
  }
}

/** Multipart body with one file field, as a browser sends it. */
export function multipart(field: string, filename: string, type: string, data: Buffer) {
  const boundary = `----gymflow${Math.random().toString(16).slice(2)}`;
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return {
    payload,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
