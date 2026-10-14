"use client";

import { CalendarDays } from "lucide-react";
import { useId } from "react";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n/types";
import { addDays, isDateOnly, type DateOnly } from "@gymflow/shared/domain/dates";
import { startOfEthiopianMonth } from "@gymflow/shared/domain/ethiopian-calendar";
import { DateInput } from "./date-input";
import { Select } from "./input";

export type RangePreset = "all" | "today" | "7d" | "30d" | "month" | "custom";

export const RANGE_LABELS: Record<RangePreset, MessageKey> = {
  all: "common.dateRange.all",
  today: "common.dateRange.today",
  "7d": "common.dateRange.last7",
  "30d": "common.dateRange.last30",
  month: "common.dateRange.month",
  custom: "common.dateRange.custom",
};

export interface ResolvedRange {
  from?: DateOnly;
  to?: DateOnly;
  /** Set when the custom range is inverted. */
  error?: "fromAfterTo";
}

/** Inclusive gym-date range for a preset; "Last 7 days" includes today, "This month" is the Ethiopian month. */
export function resolveRange(preset: RangePreset, today: DateOnly, from?: string, to?: string): ResolvedRange {
  switch (preset) {
    case "all":
      return {};
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: startOfEthiopianMonth(today), to: today };
    case "custom": {
      const f = from && isDateOnly(from) ? from : undefined;
      const t = to && isDateOnly(to) ? to : undefined;
      if (f && t && f > t) return { error: "fromAfterTo" };
      return { from: f, to: t };
    }
  }
}

/** Preset date-range filter with custom From/To inputs (design.md §13 Date Range). */
export function DateRangeFilter({
  preset,
  from,
  to,
  today,
  onChange,
  presets = ["all", "today", "7d", "30d", "month", "custom"],
  error,
}: {
  preset: RangePreset;
  from: string;
  to: string;
  today: DateOnly;
  onChange: (next: { preset: RangePreset; from: string; to: string }) => void;
  presets?: RangePreset[];
  error?: string;
}) {
  const { t } = useI18n();
  const fromLabel = useId();
  const toLabel = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Select
        aria-label={t("common.dateRange.label")}
        leftIcon={<CalendarDays aria-hidden />}
        value={preset}
        onChange={(event) => {
          const next = event.target.value as RangePreset;
          if (next === "custom") {
            const resolved = resolveRange(preset, today);
            onChange({ preset: next, from: resolved.from ?? addDays(today, -6), to: resolved.to ?? today });
          } else onChange({ preset: next, from: "", to: "" });
        }}
      >
        {presets.map((p) => (
          <option key={p} value={p}>
            {t(RANGE_LABELS[p])}
          </option>
        ))}
      </Select>
      {preset === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span id={fromLabel} className="text-caption text-fg-muted font-semibold">
              {t("common.from")}
            </span>
            <DateInput
              value={from}
              max={today}
              today={today}
              aria-labelledby={fromLabel}
              aria-invalid={error ? true : undefined}
              onChange={(date) => onChange({ preset, from: date, to })}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span id={toLabel} className="text-caption text-fg-muted font-semibold">
              {t("common.to")}
            </span>
            <DateInput
              value={to}
              max={today}
              today={today}
              aria-labelledby={toLabel}
              aria-invalid={error ? true : undefined}
              onChange={(date) => onChange({ preset, from, to: date })}
            />
          </div>
          {error ? (
            <p role="alert" className="text-caption text-danger col-span-2 font-medium">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
