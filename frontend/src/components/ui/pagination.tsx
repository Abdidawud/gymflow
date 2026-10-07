"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId } from "react";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { IconButton } from "./button";

export const PAGE_SIZES = [10, 25, 50] as const;

/** "Showing 1–10 of 350 members", page size 10/25/50, previous/next (design.md §9). */
export function Pagination({
  page,
  pageSize,
  total,
  noun,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  /** What is being counted. */
  noun: "members" | "payments" | "periods";
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  className?: string;
}) {
  const { t, rich } = useI18n();
  const sizeId = useId();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <nav
      aria-label={t("common.pagination.label")}
      className={cn(
        "border-line flex flex-col gap-3 border-t px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6",
        className,
      )}
    >
      <p className="text-fg-muted text-sm" aria-live="polite">
        {rich(
          "common.pagination.showing",
          { b: (chunks) => <span className="text-fg tabular font-semibold">{chunks}</span> },
          { from: fmt(from), to: fmt(to), total: fmt(total), noun: t(`common.pagination.nouns.${noun}`) },
        )}
      </p>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        {onPageSizeChange ? (
          <div className="flex items-center gap-2">
            <label htmlFor={sizeId} className="text-fg-muted text-sm">
              {t("common.pagination.rowsPerPage")}
            </label>
            <select
              id={sizeId}
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="border-line-strong bg-input text-fg h-11 cursor-pointer rounded-lg border px-2 text-sm md:h-9"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex items-center gap-1">
          <span className="text-fg-muted tabular mr-2 text-sm">
            {t("common.pagination.page", { page: fmt(page), pages: fmt(pageCount) })}
          </span>
          <IconButton
            label={t("common.pagination.previous")}
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="md:size-9"
          >
            <ChevronLeft aria-hidden />
          </IconButton>
          <IconButton
            label={t("common.pagination.next")}
            variant="secondary"
            disabled={page >= pageCount}
            onClick={() => onPageChange(page + 1)}
            className="md:size-9"
          >
            <ChevronRight aria-hidden />
          </IconButton>
        </div>
      </div>
    </nav>
  );
}
