import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("bg-tint-strong animate-pulse rounded-md motion-reduce:animate-none", className)} />
  );
}

/** Screen-reader announcement paired with visual skeletons. */
export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
