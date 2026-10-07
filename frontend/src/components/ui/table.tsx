"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./skeleton";

/** Scrollable table container; the page itself never scrolls horizontally (design.md §19). */
export function Table({
  caption,
  className,
  children,
  ...props
}: ComponentPropsWithRef<"table"> & { caption: string }) {
  return (
    <div className="w-full scrollbar-thin overflow-x-auto">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: ComponentPropsWithRef<"thead">) {
  return <thead className={cn("bg-tint/70", className)} {...props} />;
}

export function TH({
  className,
  align = "left",
  ...props
}: ComponentPropsWithRef<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "border-line text-fg-muted border-b px-4 py-3 text-xs font-semibold tracking-[0.06em] whitespace-nowrap uppercase first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export type SortDirection = "asc" | "desc";

/** Header cell with a sort toggle; exposes aria-sort to assistive technology. */
export function SortableTH({
  children,
  active,
  direction,
  onSort,
  align,
  className,
}: {
  children: ReactNode;
  active: boolean;
  direction: SortDirection;
  onSort: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <TH
      align={align}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("p-0 first:pl-2 sm:first:pl-3", className)}
    >
      <button
        type="button"
        onClick={onSort}
        className={cn(
          "hover:text-fg inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 tracking-[0.06em] uppercase",
          align === "right" && "flex-row-reverse",
          active && "text-fg",
        )}
      >
        {children}
        {active ? (
          direction === "asc" ? (
            <ArrowUp aria-hidden className="size-3.5" />
          ) : (
            <ArrowDown aria-hidden className="size-3.5" />
          )
        ) : (
          <ChevronsUpDown aria-hidden className="size-3.5 opacity-60" />
        )}
      </button>
    </TH>
  );
}

export function TR({ className, interactive, ...props }: ComponentPropsWithRef<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "border-line border-b last:border-b-0",
        interactive && "hover:bg-row-hover transition-colors",
        className,
      )}
      {...props}
    />
  );
}

export function TD({
  className,
  align = "left",
  ...props
}: ComponentPropsWithRef<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "text-fg px-4 py-4 align-middle first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...props}
    />
  );
}

export function TableSkeletonRows({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, row) => (
        <TR key={row}>
          {Array.from({ length: columns }, (_, col) => (
            <TD key={col}>
              <Skeleton className={cn("h-4", col === 0 ? "w-40" : "w-20")} />
            </TD>
          ))}
        </TR>
      ))}
    </>
  );
}
