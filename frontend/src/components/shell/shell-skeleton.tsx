"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n/provider";
import { BrandMark } from "./brand";

/** Neutral app frame shown while the session is verified. */
export function ShellSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite" className="min-h-dvh">
      <span className="sr-only">{t("shell.loading")}</span>
      <div className="w-sidebar border-line bg-surface fixed inset-y-0 left-0 hidden flex-col gap-3 border-r p-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark />
          <Skeleton className="h-5 w-24" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
      <div className="lg:pl-sidebar">
        <div className="h-header border-line bg-surface flex items-center gap-4 border-b px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-full max-w-xl" />
        </div>
        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-3 h-4 w-80 max-w-full" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="mt-6 h-80 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
