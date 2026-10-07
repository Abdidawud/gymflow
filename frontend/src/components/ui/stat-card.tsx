import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "./card";
import { Skeleton } from "./skeleton";

export type StatTone = "primary" | "success" | "warning" | "error" | "neutral";

const ICON_TONES: Record<StatTone, string> = {
  primary: "bg-primary-soft text-primary-soft-fg",
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  error: "bg-error-bg text-error-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
};

/** Metric card: uppercase label, large tabular value, helper text (design.md §3, §18). */
export function StatCard({
  label,
  value,
  unit,
  helper,
  icon,
  tone = "primary",
  size = "md",
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  helper?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col gap-3 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-fg-muted pt-1 text-xs font-semibold tracking-[0.08em] uppercase">{label}</p>
        {icon ? (
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5",
              ICON_TONES[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "text-fg flex items-baseline gap-1.5",
          size === "lg" ? "text-metric-sm md:text-metric" : "text-metric-sm",
        )}
      >
        <span className="truncate">{value}</span>
        {unit ? <span className="text-fg-muted text-sm font-semibold tracking-normal">{unit}</span> : null}
      </p>
      {helper ? <div className="text-fg-muted text-sm">{helper}</div> : null}
    </Card>
  );
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-4 p-5", className)}>
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3.5 w-36" />
    </Card>
  );
}
