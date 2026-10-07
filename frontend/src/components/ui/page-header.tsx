"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useDocumentTitle, useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t("common.breadcrumb")} className={className}>
      <ol className="text-fg-muted flex flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-fg rounded-sm font-medium hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "text-fg font-semibold")}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight aria-hidden className="text-fg-subtle size-4" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Page title, subtitle and primary actions in a consistent upper-right location (design.md §4). */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  badge,
  documentTitle,
  className,
}: {
  title: ReactNode;
  /** Browser tab title when `title` isn't plain text. */
  documentTitle?: string;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  useDocumentTitle(documentTitle ?? (typeof title === "string" ? title : null));
  return (
    <header className={cn("mb-6 flex flex-col gap-4 md:mb-8 lg:flex-row lg:items-end lg:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumbs ? <Breadcrumbs items={breadcrumbs} className="mb-2" /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page-sm text-fg md:text-page break-words">{title}</h1>
          {badge}
        </div>
        {description ? <p className="text-fg-muted mt-1.5 text-[15px] md:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3 print:hidden">{actions}</div> : null}
    </header>
  );
}
