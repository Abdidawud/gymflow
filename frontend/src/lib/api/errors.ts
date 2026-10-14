import { readStoredLocale } from "@/i18n/config";
import { getTranslator } from "@/i18n/translator";
import type { ApiErrorCode } from "@gymflow/shared/api/errors";

export type { ApiErrorCode };

/**
 * API error model (backend design §8): errors carry a stable code, a message,
 * optional field errors and a request ID for support.
 */

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
  details?: Record<string, unknown>;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors: Record<string, string>;
  readonly details: Record<string, unknown>;
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fieldErrors = init.fieldErrors ?? {};
    this.details = init.details ?? {};
    this.requestId = init.requestId;
  }

  /** The request may or may not have been applied (connection lost, timeout, gateway error). */
  get isUncertain(): boolean {
    return this.code === "NETWORK_ERROR" || this.status === 502 || this.status === 503 || this.status === 504;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

/** A human message suitable for a toast or inline error. */
export function errorMessage(error: unknown, fallback?: string): string {
  const message = fallback ?? getTranslator(readStoredLocale()).t("common.feedback.generic");
  if (error instanceof ApiError) return error.message || message;
  return message;
}
