"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { LoadError } from "@/components/ui/feedback";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/providers/auth-provider";
import { ShellSkeleton } from "./shell-skeleton";

/**
 * Renders the authenticated app only for a valid session. Otherwise sends the
 * user to sign in, preserving a safe return route (design.md §20), or to the
 * forced first-login password change.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, account, endReason, retry } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (status === "unauthenticated") {
      const params = new URLSearchParams();
      const here = `${window.location.pathname}${window.location.search}`;
      if (endReason !== "signed-out" && here !== "/dashboard") params.set("next", here);
      if (endReason === "session-expired" || endReason === "deactivated") params.set("reason", endReason);
      const qs = params.toString();
      router.replace(qs ? `/login?${qs}` : "/login");
    } else if (status === "authenticated" && account?.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [status, account, endReason, router]);

  if (status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoadError onRetry={retry} message={t("shell.connectError")} />
      </div>
    );
  }
  if (status !== "authenticated" || account?.mustChangePassword) return <ShellSkeleton />;
  return <>{children}</>;
}
