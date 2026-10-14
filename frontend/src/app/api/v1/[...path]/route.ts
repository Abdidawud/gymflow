/**
 * The GymFlow API (backend/), served in-process by the web app: one
 * deployment and one origin, so session cookies stay first-party and no CORS
 * is needed. Requests go through the full Fastify app — authentication, CSRF,
 * validation and error handling — exactly as on a standalone API server.
 *
 * On Vercel, idle database connections are released before an instance
 * suspends (attachDatabasePool), and work such as sending a password-reset
 * email runs after the response (after → waitUntil).
 */

import { handleApiRequest } from "@gymflow/backend/web";
import { attachDatabasePool } from "@vercel/functions";
import { after } from "next/server";

export const maxDuration = 30;

function handler(request: Request): Promise<Response> {
  return handleApiRequest(request, {
    onPool: (pool) => attachDatabasePool(pool),
    after: (task) => after(task),
  });
}

export { handler as DELETE, handler as GET, handler as HEAD, handler as OPTIONS, handler as PATCH, handler as POST };
