import type { FastifyInstance } from "fastify";
import { sql } from "kysely";
import { latestMigrationVersion } from "../db/migrate";
import type { Env } from "../http/context";

/** Liveness and readiness probes (backend design §9, §13). No configuration details are exposed. */
export async function healthRoutes(app: FastifyInstance, env: Env) {
  const expected = latestMigrationVersion().catch(() => null);

  app.get("/health", { config: { auth: "public" } }, async () => ({
    status: "ok",
  }));

  app.get("/ready", { config: { auth: "public" } }, async (request, reply) => {
    try {
      const result = await sql<{
        version: string | null;
      }>`SELECT max(version) AS version FROM schema_migrations`.execute(env.db);
      const applied = result.rows[0]?.version ?? null;
      const latest = await expected;
      if (latest && applied !== latest) {
        return reply.code(503).send({ status: "migrations-pending" });
      }
      return { status: "ready" };
    } catch (error) {
      request.log.error({ err: error }, "readiness check failed");
      return reply.code(503).send({ status: "unavailable" });
    }
  });
}
