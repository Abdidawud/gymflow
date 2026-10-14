"use client";

import { Archive } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { detailOf, detailText } from "@/i18n/membership";
import { useI18n } from "@/i18n/provider";
import type { MembershipState } from "@gymflow/shared/api/types";
import type { MembershipStatus } from "@gymflow/shared/domain/membership";

export const STATUS_TONE: Record<MembershipStatus, BadgeTone> = {
  ACTIVE: "success",
  EXPIRING_SOON: "warning",
  EXPIRED: "error",
  SCHEDULED: "info",
  UNPAID: "neutral",
};

const dot = <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />;

/**
 * Membership status pill with text (design.md §3): "Active · 23d left",
 * "Expiring Soon · 3d left", "Scheduled · Starts Oct 12", "Expired", "Unpaid".
 */
export function StatusBadge({
  state,
  detail = "short",
  className,
}: {
  state: Pick<MembershipState, "status" | "remainingDays" | "daysUntilStart" | "next" | "last" | "coverageEnd">;
  detail?: "none" | "short" | "long";
  className?: string;
}) {
  const i18n = useI18n();
  const status = i18n.t(`labels.status.${state.status}`);
  const qualifier = detail === "none" || state.status === "EXPIRED" ? null : detailOf(state);
  const label = qualifier ? `${status} · ${detailText(i18n, qualifier, detail === "short")}` : status;
  return (
    <Badge tone={STATUS_TONE[state.status]} className={className} icon={dot}>
      {label}
    </Badge>
  );
}

export function ArchivedBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <Badge tone="neutral" className={className} icon={<Archive aria-hidden />}>
      {t("labels.archived")}
    </Badge>
  );
}

export function PaidBadge() {
  const { t } = useI18n();
  return (
    <Badge tone="success" icon={dot}>
      {t("labels.paid")}
    </Badge>
  );
}
