"use client";

import type { ReactNode } from "react";
import { StatusScreen } from "@/components/ui/feedback";
import type { Permission } from "@/lib/domain/permissions";
import { useSession } from "@/providers/auth-provider";

/**
 * Administrator-only screens (design.md §2, §6). Hiding navigation is only a
 * convenience: the backend enforces the same rules on every request.
 */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession();
  if (!can(permission)) return <StatusScreen kind="forbidden" />;
  return <>{children}</>;
}
