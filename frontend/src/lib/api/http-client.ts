/**
 * HTTP implementation of the GymFlow API (backend design §8).
 *
 * - Session: HttpOnly cookie, so every request uses `credentials: "include"`.
 * - CSRF: the token from a readable cookie is echoed in a header on writes.
 * - Payments: an `Idempotency-Key` header makes retries safe.
 * - Errors: the `{ error: { code, message, fieldErrors, requestId } }` envelope
 *   is turned into `ApiError`; connection failures become NETWORK_ERROR so
 *   the UI can treat the outcome as uncertain.
 */

import { readStoredLocale } from "@/i18n/config";
import { getTranslator } from "@/i18n/translator";
import type { GymFlowApi } from "./contract";
import { ApiError, type ApiErrorCode } from "./errors";
import type { Paginated, PaymentList, RecordPaymentResult } from "@gymflow/shared/api/types";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
const CSRF_COOKIE = process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "gf_csrf";
const CSRF_HEADER = "X-CSRF-Token";
const REQUEST_TIMEOUT_MS = 20_000;

type QueryValue = string | number | boolean | null | undefined;

interface RequestOptions {
  query?: object;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
}

interface RawResponse<T> {
  status: number;
  data: T;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function buildUrl(path: string, query?: object): string {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
}

async function toApiError(response: Response, requestId: string): Promise<ApiError> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON error body (proxy or gateway page).
  }
  const envelope =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error: Record<string, unknown> }).error
      : (payload as Record<string, unknown> | null);

  const fallbackCode: ApiErrorCode =
    response.status === 401
      ? "UNAUTHENTICATED"
      : response.status === 403
        ? "FORBIDDEN"
        : response.status === 404
          ? "NOT_FOUND"
          : response.status === 422
            ? "VALIDATION_FAILED"
            : response.status === 429
              ? "RATE_LIMITED"
              : "INTERNAL";

  return new ApiError({
    status: response.status,
    code: (envelope?.code as ApiErrorCode | undefined) ?? fallbackCode,
    message:
      (envelope?.message as string | undefined) ?? getTranslator(readStoredLocale()).t("common.feedback.generic"),
    fieldErrors: (envelope?.fieldErrors as Record<string, string> | undefined) ?? undefined,
    details: (envelope?.details as Record<string, unknown> | undefined) ?? undefined,
    requestId: (envelope?.requestId as string | undefined) ?? response.headers.get("X-Request-ID") ?? requestId,
  });
}

async function send<T>(method: string, path: string, options: RequestOptions = {}): Promise<RawResponse<T>> {
  const requestId = newRequestId();
  const headers: Record<string, string> = {
    Accept: "application/json",
    // The backend localizes messages (errors, field errors) from this header.
    "Accept-Language": readStoredLocale(),
    "X-Request-ID": requestId,
    ...options.headers,
  };
  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: getTranslator(readStoredLocale()).t("common.feedback.networkError"),
      requestId,
    });
  }

  if (!response.ok) throw await toApiError(response, requestId);
  if (response.status === 204) return { status: 204, data: undefined as T };
  return { status: response.status, data: (await response.json()) as T };
}

async function call<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  return (await send<T>(method, path, options)).data;
}

const id = (value: string) => encodeURIComponent(value);

function fileForm(field: string, file: File): FormData {
  const form = new FormData();
  form.append(field, file);
  return form;
}

export function createHttpApi(): GymFlowApi {
  return {
    auth: {
      session: () => call("GET", "/auth/me"),
      login: (input) => call("POST", "/auth/login", { body: input }),
      logout: () => call("POST", "/auth/logout"),
      forgotPassword: (email) => call("POST", "/auth/forgot-password", { body: { email } }),
      resetPassword: (input) => call("POST", "/auth/reset-password", { body: input }),
    },
    account: {
      changePassword: (input) => call("POST", "/account/change-password", { body: input }),
      updatePreferences: (input) => call("PATCH", "/account/preferences", { body: input }),
    },
    members: {
      list: (query) => call("GET", "/members", { query }),
      findByPhone: async (phone, excludeId) => {
        const result = await call<Paginated<{ id: string; memberCode: string; fullName: string }>>("GET", "/members", {
          query: { phone, pageSize: 2, archived: "any" },
        });
        return result.items.find((m) => m.id !== excludeId) ?? null;
      },
      get: (memberId) => call("GET", `/members/${id(memberId)}`),
      create: (input) => call("POST", "/members", { body: input }),
      update: (memberId, input) => call("PATCH", `/members/${id(memberId)}`, { body: input }),
      archive: (memberId) => call("POST", `/members/${id(memberId)}/archive`),
      reactivate: (memberId) => call("POST", `/members/${id(memberId)}/reactivate`),
      payments: (memberId, query) => call("GET", `/members/${id(memberId)}/payments`, { query }),
      memberships: (memberId, query) => call("GET", `/members/${id(memberId)}/memberships`, { query }),
      uploadPhoto: (memberId, file) =>
        call("POST", `/members/${id(memberId)}/photo`, { form: fileForm("photo", file) }),
      removePhoto: (memberId) => call("DELETE", `/members/${id(memberId)}/photo`),
    },
    memberships: {
      list: (query) => call("GET", "/memberships", { query }),
    },
    plans: {
      list: (options) => call("GET", "/plans", { query: { includeDisabled: options?.includeDisabled } }),
      create: (input) => call("POST", "/plans", { body: input }),
      update: (planId, input) => call("PATCH", `/plans/${id(planId)}`, { body: input }),
      disable: (planId) => call("POST", `/plans/${id(planId)}/disable`),
      enable: (planId) => call("POST", `/plans/${id(planId)}/enable`),
    },
    payments: {
      preview: (input) => call("POST", "/payments/preview", { body: input }),
      record: async (input, idempotencyKey) => {
        const { status, data } = await send<{ payment: RecordPaymentResult["payment"] }>("POST", "/payments", {
          body: input,
          headers: { "Idempotency-Key": idempotencyKey },
        });
        // 201 = newly recorded; 200 = safe replay of the same operation key.
        return { payment: data.payment, replayed: status === 200 };
      },
      list: (query) => call<PaymentList>("GET", "/payments", { query }),
      get: (paymentId) => call("GET", `/payments/${id(paymentId)}`),
      receipt: (paymentId) => call("GET", `/payments/${id(paymentId)}/receipt`),
    },
    dashboard: {
      get: () => call("GET", "/dashboard"),
    },
    reports: {
      revenue: (range) => call("GET", "/reports/revenue", { query: range }),
      memberships: (range) => call("GET", "/reports/memberships", { query: range }),
    },
    users: {
      list: () => call("GET", "/users"),
      create: (input) => call("POST", "/users", { body: input }),
      update: (userId, input) => call("PATCH", `/users/${id(userId)}`, { body: input }),
      deactivate: (userId) => call("POST", `/users/${id(userId)}/deactivate`),
      activate: (userId) => call("POST", `/users/${id(userId)}/activate`),
    },
    settings: {
      get: () => call("GET", "/settings"),
      update: (input) => call("PATCH", "/settings", { body: input }),
      uploadLogo: (file) => call("POST", "/settings/logo", { form: fileForm("logo", file) }),
    },
  };
}
