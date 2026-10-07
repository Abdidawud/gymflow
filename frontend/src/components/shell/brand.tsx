import { cn } from "@/lib/utils";

/** GymFlow brand mark. */
export function BrandMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-base font-bold",
        inverted ? "bg-white text-[#4338ca]" : "bg-primary text-on-primary",
        className,
      )}
    >
      G
    </span>
  );
}

export function Brand({ gymName, inverted = false }: { gymName?: string | null; inverted?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark inverted={inverted} />
      <div className="min-w-0 leading-tight">
        <p className={cn("text-lg font-bold tracking-[-0.01em]", inverted ? "text-white" : "text-fg")}>GymFlow</p>
        {gymName ? (
          <p className={cn("truncate text-[13px] font-medium", inverted ? "text-white/80" : "text-fg-muted")}>
            {gymName}
          </p>
        ) : null}
      </div>
    </div>
  );
}
