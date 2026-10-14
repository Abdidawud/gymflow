/**
 * Serves the API from a web-standard request handler, so the web app can host
 * it in-process (a Next.js route handler at /api/v1/[...path], e.g. on
 * Vercel): one deployment, one origin, first-party cookies, no CORS.
 *
 * The Fastify app is created once per process (or serverless instance) and
 * reused; each request runs through the full app — security hooks, routes and
 * error handling — via `inject`, exactly like the standalone server.
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { createDb, createPool } from "./db";
import { createClock } from "./lib/clock";
import { FileStorage } from "./services/storage";

type Task = () => Promise<unknown>;

export interface WebApiOptions {
  /** Called once with the new connection pool (on Vercel: attachDatabasePool). */
  onPool?: (pool: pg.Pool) => void;
  /** Runs work after the response is sent (in Next.js: `after`). */
  after?: (task: Task) => void;
}

const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "content-length", "upgrade"]);
/**
 * Links an injected request to the list collecting its deferred work. Always
 * overwritten by the adapter, so clients cannot set it. (Async context does not
 * survive Fastify's inject, hence an explicit link.)
 */
const DEFER_HEADER = "x-gymflow-internal-request";
const deferredByRequest = new Map<string, Task[]>();
let instance: Promise<FastifyInstance> | null = null;

async function create(options: WebApiOptions): Promise<FastifyInstance> {
  const config = loadConfig();
  const pool = createPool({ url: config.database.url, poolMax: config.database.poolMax, ssl: config.database.ssl });
  options.onPool?.(pool);
  const app = await buildApp({
    config,
    db: createDb(pool),
    pool,
    clock: createClock(config.fixedToday),
    storage: new FileStorage(),
    // Work deferred during a request runs after its response (see handleApiRequest).
    deferForRequest: (request) => {
      const id = request.headers[DEFER_HEADER];
      const tasks = typeof id === "string" ? deferredByRequest.get(id) : undefined;
      return tasks ? (task) => void tasks.push(task) : null;
    },
  });
  await app.ready();
  return app;
}

function getApp(options: WebApiOptions): Promise<FastifyInstance> {
  instance ??= create(options).catch((error: unknown) => {
    instance = null; // retry on the next request (e.g. after a configuration fix)
    throw error;
  });
  return instance;
}

/** The client's address as reported by the platform's proxy (Vercel sets X-Forwarded-For). */
function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "127.0.0.1";
}

export async function handleApiRequest(request: Request, options: WebApiOptions = {}): Promise<Response> {
  let app: FastifyInstance;
  try {
    app = await getApp(options);
  } catch (error) {
    console.error("[api] failed to start:", error instanceof Error ? error.message : error);
    return Response.json(
      { error: { code: "INTERNAL", message: "GymFlow is temporarily unavailable.", requestId: "startup" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const url = new URL(request.url);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const payload = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;
  const tasks: Task[] = [];
  const requestId = randomUUID();
  deferredByRequest.set(requestId, tasks);

  let res;
  try {
    res = await app.inject({
      method: request.method as "GET",
      url: url.pathname + url.search,
      headers: { ...Object.fromEntries(request.headers), [DEFER_HEADER]: requestId },
      payload: payload && payload.length > 0 ? payload : undefined,
      remoteAddress: clientAddress(request),
    });
  } finally {
    deferredByRequest.delete(requestId);
  }

  if (tasks.length > 0) {
    const run = () => Promise.allSettled(tasks.map((task) => task()));
    if (options.after) options.after(run);
    else void run();
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(res.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name.toLowerCase())) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(name, String(item));
    else headers.set(name, String(value));
  }
  const empty = res.statusCode === 204 || res.statusCode === 304 || request.method === "HEAD";
  return new Response(empty ? null : new Uint8Array(res.rawPayload), { status: res.statusCode, headers });
}
