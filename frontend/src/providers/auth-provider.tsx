"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { readStoredLocale, type Locale } from "@/i18n/config";
import { consumeExplicitLocaleChoice, setLocale } from "@/i18n/provider";
import type { Appearance, CurrentAccount, GymContext, LoginRequest, Session } from "@/lib/api/types";
import type { Permission } from "@/lib/domain/permissions";
import { queryKeys } from "@/lib/query-keys";
import { setThemePreference, type ThemePreference } from "@/lib/theme";
import { setAuthErrorHandler } from "./query-provider";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";
export type SessionEndReason = "session-expired" | "deactivated" | "signed-out";

interface AuthContextValue {
  status: AuthStatus;
  account: CurrentAccount | null;
  gym: GymContext | null;
  /** Why the last session ended, for the sign-in screen message. */
  endReason: SessionEndReason | null;
  can: (permission: Permission) => boolean;
  signIn: (input: LoginRequest) => Promise<Session>;
  signOut: () => Promise<void>;
  retry: () => void;
  updateAppearance: (appearance: Appearance) => void;
  /** Switch the interface language and save it to the account. */
  updateLanguage: (language: Locale) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const toPreference = (appearance: Appearance): ThemePreference => appearance.toLowerCase() as ThemePreference;

/**
 * The account's saved appearance and language apply when signing in (design.md §17, My Account);
 * afterwards this device keeps whatever the user picks, even before the save reaches the server.
 * A language chosen on the sign-in screen wins and is saved to the account instead.
 */
function applyAccountPreferences(account: CurrentAccount): CurrentAccount {
  setThemePreference(toPreference(account.appearance));
  const deviceLanguage = readStoredLocale();
  if (consumeExplicitLocaleChoice()) {
    if (deviceLanguage === account.language) return account;
    api.account.updatePreferences({ language: deviceLanguage }).catch(() => {});
    return { ...account, language: deviceLanguage };
  }
  if (account.language !== deviceLanguage) setLocale(account.language);
  return account;
}

async function fetchSession(): Promise<Session | null> {
  try {
    return await api.auth.session();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [endReason, setEndReason] = useState<SessionEndReason | null>(null);

  const sessionQuery = useQuery({
    queryKey: queryKeys.session,
    queryFn: fetchSession,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
  });

  const session = sessionQuery.data ?? null;

  /** End the session locally and drop every cached record from the previous user. */
  const endSession = useCallback(
    (reason: SessionEndReason) => {
      setEndReason(reason);
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.session[0] });
      queryClient.setQueryData(queryKeys.session, null);
    },
    [queryClient],
  );

  useEffect(() => {
    setAuthErrorHandler((error, source) => {
      if (source?.[0] === queryKeys.session[0]) return;
      if (error.code === "PASSWORD_CHANGE_REQUIRED") {
        void queryClient.invalidateQueries({ queryKey: queryKeys.session });
        return;
      }
      endSession(error.code === "ACCOUNT_DEACTIVATED" ? "deactivated" : "session-expired");
    });
    return () => setAuthErrorHandler(null);
  }, [endSession, queryClient]);

  const loginMutation = useMutation({ mutationFn: (input: LoginRequest) => api.auth.login(input) });

  const signIn = useCallback(
    async (input: LoginRequest) => {
      const login = await loginMutation.mutateAsync(input);
      const next = { ...login, account: applyAccountPreferences(login.account) };
      setEndReason(null);
      queryClient.setQueryData(queryKeys.session, next);
      return next;
    },
    [loginMutation, queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Even if the request fails, forget the session locally.
    }
    endSession("signed-out");
  }, [endSession]);

  const updateAppearance = useCallback(
    (appearance: Appearance) => {
      setThemePreference(toPreference(appearance));
      queryClient.setQueryData<Session | null>(queryKeys.session, (current) =>
        current ? { ...current, account: { ...current.account, appearance } } : current,
      );
      api.account.updatePreferences({ appearance }).catch(() => {
        // Appearance is a convenience; the local choice still applies.
      });
    },
    [queryClient],
  );

  const updateLanguage = useCallback(
    (language: Locale) => {
      setLocale(language);
      queryClient.setQueryData<Session | null>(queryKeys.session, (current) =>
        current ? { ...current, account: { ...current.account, language } } : current,
      );
      api.account.updatePreferences({ language }).catch(() => {
        // The device keeps the choice even if saving to the account fails.
      });
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(() => {
    let status: AuthStatus = "loading";
    if (sessionQuery.isPending) status = "loading";
    else if (sessionQuery.isError && !session) status = "error";
    else status = session ? "authenticated" : "unauthenticated";

    const permissions = new Set(session?.account.permissions ?? []);
    return {
      status,
      account: session?.account ?? null,
      gym: session?.gym ?? null,
      endReason,
      can: (permission) => permissions.has(permission),
      signIn,
      signOut,
      retry: () => void sessionQuery.refetch(),
      updateAppearance,
      updateLanguage,
    };
  }, [sessionQuery, session, endReason, signIn, signOut, updateAppearance, updateLanguage]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

/** For screens inside the authenticated shell, where the session is guaranteed. */
export function useSession(): { account: CurrentAccount; gym: GymContext; can: (permission: Permission) => boolean } {
  const { account, gym, can } = useAuth();
  if (!account || !gym) throw new Error("useSession must be used inside the authenticated app shell");
  return { account, gym, can };
}
