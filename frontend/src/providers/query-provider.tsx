"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/errors";

type AuthErrorHandler = (error: ApiError, source: readonly unknown[] | undefined) => void;
let authErrorHandler: AuthErrorHandler | null = null;

/** The auth provider registers here to react to 401/403 responses from any request. */
export function setAuthErrorHandler(handler: AuthErrorHandler | null) {
  authErrorHandler = handler;
}

function report(error: unknown, queryKey?: readonly unknown[]) {
  if (error instanceof ApiError && (error.status === 401 || error.code === "PASSWORD_CHANGE_REQUIRED")) {
    authErrorHandler?.(error, queryKey);
  }
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => report(error, query.queryKey) }),
    mutationCache: new MutationCache({ onError: (error) => report(error) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        // Retry only transient failures; 4xx responses are definitive.
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

let browserClient: QueryClient | undefined;

function getQueryClient() {
  // Isolate server renders; reuse one client in the browser.
  if (typeof window === "undefined") return makeQueryClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
