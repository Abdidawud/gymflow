/**
 * Expected failures carry an HTTP status, a stable code from the shared
 * contract and a message already in the request's language. Anything else is
 * an unexpected error: logged with its request ID and answered with a generic 500.
 */

import type { ApiErrorCode } from "@gymflow/shared/api/errors";
import type { Translate } from "./i18n";

export interface AppErrorExtra {
  fieldErrors?: Record<string, string>;
  details?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly extra: AppErrorExtra = {},
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function fail(status: number, code: ApiErrorCode, message: string, extra?: AppErrorExtra): never {
  throw new AppError(status, code, message, extra);
}

/** 422 with one message per field, as the forms show them. */
export function invalid(t: Translate, fieldErrors: Record<string, string>): never {
  throw new AppError(422, "VALIDATION_FAILED", t("checkFields"), {
    fieldErrors,
  });
}

export function notFound(t: Translate): never {
  throw new AppError(404, "NOT_FOUND", t("notFound"));
}

export function forbidden(t: Translate, message?: string): never {
  throw new AppError(403, "FORBIDDEN", message ?? t("forbidden"));
}

/** Collects field errors, then throws them together. */
export class FieldErrors {
  private readonly errors: Record<string, string> = {};

  constructor(private readonly t: Translate) {}

  add(field: string, message: string): void {
    this.errors[field] ??= message;
  }

  has(field?: string): boolean {
    return field ? field in this.errors : Object.keys(this.errors).length > 0;
  }

  throwIfAny(): void {
    if (this.has()) invalid(this.t, this.errors);
  }

  get all(): Record<string, string> {
    return { ...this.errors };
  }
}
