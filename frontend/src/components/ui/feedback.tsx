"use client";

import { CircleAlert, CircleCheck, Info, RefreshCw, ShieldAlert, SearchX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useDocumentTitle, useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type AlertTone = "info" | "success" | "warning" | "error";

const ALERT_TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "bg-primary-soft text-primary-soft-fg", icon: <Info aria-hidden /> },
  success: { box: "bg-success-bg text-success-fg", icon: <CircleCheck aria-hidden /> },
  warning: { box: "bg-warning-bg text-warning-fg", icon: <TriangleAlert aria-hidden /> },
  error: { box: "bg-error-bg text-error-fg", icon: <CircleAlert aria-hidden /> },
};

/** Inline banner for contextual guidance, warnings and errors. */
export function Alert({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
  live = false,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
  /** Announce to assistive technology when it appears. */
  live?: boolean;
}) {
  const styles = ALERT_TONES[tone];
  return (
    <div
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
      className={cn("flex items-start gap-3 rounded-lg px-4 py-3 text-sm", styles.box, className)}
    >
      <span className="mt-0.5 shrink-0 [&_svg]:size-[18px]">{icon ?? styles.icon}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-0.5", "leading-5 opacity-95")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}

/** Empty state with an icon, explanation and next actions (design.md §20). */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      <span className="bg-primary-soft text-primary-soft-fg flex size-14 items-center justify-center rounded-2xl [&_svg]:size-7">
        {icon ?? <SearchX aria-hidden />}
      </span>
      <h3 className="text-fg mt-4 text-lg font-semibold">{title}</h3>
      {description ? <p className="text-fg-muted mt-1 max-w-md text-sm">{description}</p> : null}
      {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

/** "Couldn't load this information" + Retry (design.md §20). */
export function LoadError({
  onRetry,
  retrying,
  message,
  className,
}: {
  onRetry: () => void;
  retrying?: boolean;
  message?: string;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div role="alert" className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <span className="bg-error-bg text-error-fg flex size-12 items-center justify-center rounded-2xl [&_svg]:size-6">
        <CircleAlert aria-hidden />
      </span>
      <p className="text-fg mt-4 text-base font-semibold">{message ?? t("common.feedback.loadError")}</p>
      <p className="text-fg-muted mt-1 text-sm">{t("common.feedback.loadErrorHint")}</p>
      <Button
        variant="secondary"
        className="mt-5"
        onClick={onRetry}
        loading={retrying}
        leftIcon={<RefreshCw aria-hidden />}
      >
        {t("common.retry")}
      </Button>
    </div>
  );
}

/** Shared error screens: access denied and record not found (design.md §6, §20). */
export function StatusScreen({
  kind,
  backHref = "/dashboard",
  backLabel,
}: {
  kind: "forbidden" | "not-found";
  backHref?: string;
  backLabel?: string;
}) {
  const { t } = useI18n();
  const forbidden = kind === "forbidden";
  const title = forbidden ? t("common.feedback.forbiddenTitle") : t("common.feedback.notFoundTitle");
  useDocumentTitle(title);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span
        className={cn(
          "flex size-16 items-center justify-center rounded-2xl [&_svg]:size-8",
          forbidden ? "bg-error-bg text-error-fg" : "bg-primary-soft text-primary-soft-fg",
        )}
      >
        {forbidden ? <ShieldAlert aria-hidden /> : <SearchX aria-hidden />}
      </span>
      <h1 className="text-page-sm text-fg md:text-section mt-5">{title}</h1>
      <p className="text-fg-muted mt-2 max-w-md text-sm">
        {forbidden ? t("common.feedback.forbiddenText") : t("common.feedback.notFoundText")}
      </p>
      <Button asChild className="mt-6">
        <Link href={backHref}>{backLabel ?? t("common.feedback.backToDashboard")}</Link>
      </Button>
    </div>
  );
}
