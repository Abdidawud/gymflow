/**
 * One error format for every failure (backend design §8):
 *   { "error": { code, message, fieldErrors?, details?, requestId } }
 * Messages are in the request's language. Unexpected errors are logged with
 * the request ID and never leak stack traces or SQL to the client.
 */

import type { ApiErrorBody } from "@gymflow/shared/api/errors";
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { isPgError, PG } from "../db";
import { AppError } from "../lib/errors";
import { negotiateLocale, translator, type Translate } from "../lib/i18n";

function translate(request: FastifyRequest): Translate {
  return (
    request.ctx?.t ??
    translator(negotiateLocale(request.headers["accept-language"]))
  );
}

function send(
  reply: FastifyReply,
  request: FastifyRequest,
  error: AppError,
): void {
  const body: ApiErrorBody = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.extra.fieldErrors
        ? { fieldErrors: error.extra.fieldErrors }
        : {}),
      ...(error.extra.details ? { details: error.extra.details } : {}),
      requestId: String(request.id),
    },
  };
  if (error.extra.headers) reply.headers(error.extra.headers);
  void reply.code(error.status).send(body);
}

/** Database constraint violations that slipped past the service checks (e.g. a race). */
function fromDatabase(error: unknown, t: Translate): AppError | null {
  if (!isPgError(error)) return null;
  if (
    error.code === PG.EXCLUSION_VIOLATION &&
    error.constraint === "memberships_no_overlap"
  ) {
    return new AppError(409, "STALE_PREVIEW", t("previewChanged"));
  }
  if (error.code === PG.UNIQUE_VIOLATION) {
    switch (error.constraint) {
      case "members_phone_key":
        return new AppError(409, "DUPLICATE_PHONE", t("duplicatePhone"), {
          fieldErrors: { phone: t("duplicatePhone") },
        });
      case "staff_email_key":
        return new AppError(409, "DUPLICATE_EMAIL", t("duplicateEmail"), {
          fieldErrors: { email: t("duplicateEmail") },
        });
      case "plans_name_key":
        return new AppError(409, "DUPLICATE_PLAN_NAME", t("planNameTaken"), {
          fieldErrors: { name: t("planNameTaken") },
        });
    }
  }
  return null;
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError, request, reply) => {
    const t = translate(request);
    if (error instanceof AppError) return send(reply, request, error);

    const known = fromDatabase(error, t);
    if (known) {
      request.log.warn(
        { err: error },
        "constraint violation mapped to %s",
        known.code,
      );
      return send(reply, request, known);
    }

    const status = (error as FastifyError).statusCode;
    if (
      status === 413 ||
      (error as FastifyError).code === "FST_REQ_FILE_TOO_LARGE"
    ) {
      return send(
        reply,
        request,
        new AppError(422, "VALIDATION_FAILED", t("payloadTooLarge")),
      );
    }
    if (status === 429)
      return send(
        reply,
        request,
        new AppError(429, "RATE_LIMITED", t("tooManyRequests")),
      );
    if (status && status >= 400 && status < 500) {
      // Malformed JSON, wrong content type, missing multipart boundary…
      return send(
        reply,
        request,
        new AppError(400, "VALIDATION_FAILED", t("malformed")),
      );
    }

    request.log.error({ err: error }, "unhandled error");
    return send(reply, request, new AppError(500, "INTERNAL", t("internal")));
  });

  app.setNotFoundHandler((request, reply) => {
    send(
      reply,
      request,
      new AppError(404, "NOT_FOUND", translate(request)("routeNotFound")),
    );
  });
}
