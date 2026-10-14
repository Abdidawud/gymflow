/**
 * Stable API error codes (backend design §8). Clients branch on the code; the
 * message is human text in the request's language.
 */

export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "SESSION_EXPIRED",
  "INVALID_CREDENTIALS",
  "ACCOUNT_DEACTIVATED",
  "PASSWORD_CHANGE_REQUIRED",
  "INVALID_RESET_TOKEN",
  "INVALID_CURRENT_PASSWORD",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "DUPLICATE_PHONE",
  "DUPLICATE_EMAIL",
  "DUPLICATE_PLAN_NAME",
  "DATE_CONFLICT",
  "STALE_PREVIEW",
  "IDEMPOTENCY_CONFLICT",
  "MEMBER_ARCHIVED",
  "PLAN_DISABLED",
  "PAYMENT_METHOD_DISABLED",
  "LAST_ADMINISTRATOR",
  "RATE_LIMITED",
  "NETWORK_ERROR",
  "INTERNAL",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Error response body: `{ "error": { ... } }`. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    fieldErrors?: Record<string, string>;
    details?: Record<string, unknown>;
    requestId: string;
  };
}
