"use client";

import { Tabs as TabsPrimitive, ToggleGroup } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

/** Segmented tab list in a tinted track, as in the Stitch profile and settings screens. */
export function TabsList({ className, ...props }: ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "bg-tint inline-flex max-w-full scrollbar-thin items-center gap-1 overflow-x-auto rounded-xl p-1",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  count,
  icon,
  children,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Trigger> & { count?: number; icon?: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "group text-fg-muted inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap transition-colors",
        "hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-card",
        "[&_svg]:size-[18px]",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count !== undefined ? (
        <span className="bg-tint-strong text-fg-muted tabular group-data-[state=active]:bg-primary-soft group-data-[state=active]:text-primary-soft-fg rounded-full px-2 py-0.5 text-xs font-semibold">
          {count.toLocaleString("en-US")}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Single-choice segmented control (e.g. 7 Days / 30 Days). */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
  size = "md",
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as T);
      }}
      aria-label={label}
      className={cn("bg-tint inline-flex items-center gap-1 rounded-lg p-1", className)}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            "text-fg-muted inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold whitespace-nowrap transition-colors",
            "hover:text-fg data-[state=on]:bg-primary data-[state=on]:text-on-primary data-[state=on]:shadow-card [&_svg]:size-4",
            size === "sm" ? "h-9 md:h-8" : "h-10",
          )}
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
