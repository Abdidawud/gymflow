/**
 * GET /internal/cron — scheduled maintenance for serverless hosting. Vercel
 * Cron calls it with "Authorization: Bearer $CRON_SECRET"; without a
 * configured secret the route does not exist.
 */

import type { FastifyInstance } from "fastify";
import type { Env } from "../http/context";
import { safeEqual } from "../lib/crypto";
import { fail } from "../lib/errors";
import { cleanup, sendPendingEmail } from "../services/jobs";

export async function internalRoutes(app: FastifyInstance, env: Env) {
  app.get("/internal/cron", { config: { auth: "public" } }, async (request) => {
    const secret = env.config.cronSecret;
    const header = request.headers.authorization ?? "";
    if (!secret || !safeEqual(header, `Bearer ${secret}`)) fail(404, "NOT_FOUND", request.ctx.t("routeNotFound"));
    const [cleaned, sent] = await Promise.all([cleanup(env), sendPendingEmail(env)]);
    return { cleanup: cleaned.ran, emailsSent: sent };
  });
}
