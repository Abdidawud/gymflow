import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "success" | "warning" | "error" | "neutral" | "info" | "primary";

const TONES: Record<BadgeTone, string> = {
  success: "bg-success-bg text-success-fg",
  warning: "bg-warning-bg text-warning-fg",
  error: "bg-error-bg text-error-fg",
  neutral: "bg-neutral-bg text-neutral-fg",
  info: "bg-info-bg text-info-fg",
  primary: "bg-primary-soft text-primary-soft-fg",
};

/** Pill badge. Always carries text — color alone never conveys meaning (design.md §3). */
export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-xs leading-4 font-semibold tracking-[0.01em] whitespace-nowrap",
        "[&_svg]:size-3.5 [&_svg]:shrink-0",
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
