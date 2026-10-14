/**
 * The GymFlow API application: plugins, security hooks and routes under
 * /api/v1. `buildApp` takes its dependencies explicitly so tests run the real
 * app against a test database.
 */

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import type { Env } from "./http/context";
import { registerErrorHandling } from "./http/errors";
import { authenticate, checkOrigin } from "./http/security";
import { AppError } from "./lib/errors";
import { createMailTransport } from "./services/mail";
import { negotiateLocale, translator } from "./lib/i18n";
import { accountRoutes, authRoutes } from "./modules/auth";
import { dashboardRoutes } from "./modules/dashboard";
import { healthRoutes } from "./modules/health";
import { internalRoutes } from "./modules/internal";
import { memberRoutes } from "./modules/members";
import { membershipRoutes } from "./modules/memberships";
import { paymentRoutes } from "./modules/payments";
import { planRoutes } from "./modules/plans";
import { reportRoutes } from "./modules/reports";
import { settingsRoutes } from "./modules/settings";
import { staffRoutes } from "./modules/staff";

export const API_PREFIX = "/api/v1";
/** Under Vercel's 4.5 MB request limit; the web app shrinks images before uploading. */
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

export type AppDeps = Omit<Env, "log" | "mail" | "defer"> &
  Partial<Pick<Env, "mail" | "defer">> & {
    /** Per-request deferral (the web adapter collects work to hand to the platform's after()). */
    deferForRequest?: (request: FastifyRequest) => Env["defer"] | null;
  };

declare module "fastify" {
  interface FastifyInstance {
    /** The dependencies the routes run with (for background jobs and tests). */
    env(): Env;
  }
}

export async function buildApp(deps: AppDeps, options: { logger?: boolean | object } = {}): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: options.logger ?? {
      level: config.logLevel,
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: "[redacted]",
      },
    },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
    // Correlate with the browser's X-Request-ID when it looks like an id.
    genReqId: (request) => {
      const incoming = request.headers["x-request-id"];
      return typeof incoming === "string" && REQUEST_ID_RE.test(incoming) ? incoming : randomUUID();
    },
    requestIdHeader: false,
  });

  const env: Env = {
    ...deps,
    log: app.log,
    mail: deps.mail ?? createMailTransport(config, app.log),
    defer:
      deps.defer ??
      ((task) => {
        void task().catch((error: unknown) => app.log.error({ err: error }, "deferred task failed"));
      }),
  };
  app.decorate("env", () => env);

  await app.register(cookie);
  await app.register(multipart, {
    limits: {
      fileSize: PHOTO_MAX_BYTES,
      files: 1,
      fields: 0,
      parts: 1,
      headerPairs: 50,
    },
  });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (request, context) =>
      new AppError(429, "RATE_LIMITED", (request.ctx?.t ?? translator("en"))("tooManyRequests"), {
        headers: { "Retry-After": String(Math.ceil(context.ttl / 1000)) },
      }),
  });
  // Only needed when the web app is served from another origin than the API.
  if (config.allowedOrigins.length > 1) {
    await app.register(cors, {
      origin: config.allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Accept-Language", "X-CSRF-Token", "X-Request-ID", "Idempotency-Key"],
      exposedHeaders: ["X-Request-ID"],
      maxAge: 600,
    });
  }

  registerErrorHandling(app);

  app.addHook("onRequest", async (request, reply) => {
    const locale = negotiateLocale(request.headers["accept-language"]);
    request.ctx = {
      requestId: String(request.id),
      locale,
      t: translator(locale),
      actor: null,
      sessionId: null,
      ip: request.ip,
      defer: deps.deferForRequest?.(request) ?? env.defer,
    };
    // Unknown routes fall through to the 404 handler; CORS preflights are answered by @fastify/cors.
    if (!request.routeOptions.url || request.method === "OPTIONS") return;
    checkOrigin(env, request);
    if ((request.routeOptions.config.auth ?? "session") !== "public") await authenticate(env, request, reply);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Request-ID", String(request.id));
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Resource-Policy", "same-site");
    reply.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    if (config.isProduction) reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!reply.hasHeader("Cache-Control")) reply.header("Cache-Control", "no-store");
    return payload;
  });

  await app.register(
    async (api) => {
      await healthRoutes(api, env);
      await internalRoutes(api, env);
      await authRoutes(api, env);
      await accountRoutes(api, env);
      await memberRoutes(api, env);
      await membershipRoutes(api, env);
      await planRoutes(api, env);
      await paymentRoutes(api, env);
      await dashboardRoutes(api, env);
      await reportRoutes(api, env);
      await staffRoutes(api, env);
      await settingsRoutes(api, env);
    },
    { prefix: API_PREFIX },
  );

  return app;
}
