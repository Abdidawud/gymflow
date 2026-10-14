"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addDays, dateInTimeZone, isDateOnly, maxDate, minDate, type DateOnly } from "@gymflow/shared/domain/dates";
import {
  addEthiopianMonths,
  ETHIOPIAN_MONTH_COUNT,
  ethiopianMonthLength,
  fromEthiopian,
  toEthiopian,
  type EthiopianMonth,
} from "@gymflow/shared/domain/ethiopian-calendar";
import { dayOfWeek, ETHIOPIAN_MONTH_NAMES, WEEKDAY_NAMES, WEEKDAY_SHORT_NAMES } from "@gymflow/shared/i18n/format";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { controlClasses } from "./input";

export interface DateInputProps {
  /** ISO date (YYYY-MM-DD) or "" when nothing is chosen. Shown in the Ethiopian calendar. */
  value: string;
  onChange: (value: DateOnly) => void;
  onBlur?: () => void;
  min?: DateOnly;
  max?: DateOnly;
  /** Gym date used to highlight today; defaults to the Addis Ababa date. */
  today?: DateOnly;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
  /** Visible label element id; defaults to the Field label (`${id}-label`). */
  "aria-labelledby"?: string;
  "aria-label"?: string;
}

function clamp(date: DateOnly, min?: DateOnly, max?: DateOnly): DateOnly {
  let result = date;
  if (min) result = maxDate(result, min);
  if (max) result = minDate(result, max);
  return result;
}

function monthOf(date: DateOnly): EthiopianMonth {
  const { year, month } = toEthiopian(date);
  return { year, month };
}

/** Same day of month in another month, moved back when that month is shorter (Pagume). */
function shiftMonth(date: DateOnly, delta: number): DateOnly {
  const { day } = toEthiopian(date);
  const target = addEthiopianMonths(monthOf(date), delta);
  return fromEthiopian({ ...target, day: Math.min(day, ethiopianMonthLength(target.year, target.month)) });
}

/**
 * Date field in the Ethiopian calendar (13 months, Pagume 5–6 days). The value
 * stays an ISO date, so forms, validation and the API are unchanged; people
 * only ever see and pick Ethiopian dates.
 *
 * Keyboard: arrows move by day/week, Page Up/Down by month (with Shift: year),
 * Home/End to the start/end of the week, Enter or Space to choose.
 */
export function DateInput({
  value,
  onChange,
  onBlur,
  min,
  max,
  today: todayProp,
  id,
  disabled,
  placeholder,
  className,
  "aria-labelledby": labelledBy,
  "aria-label": ariaLabel,
  ...aria
}: DateInputProps) {
  const { t, f, locale } = useI18n();
  const generated = useId();
  const controlId = id ?? `date-${generated}`;
  const valueId = `${controlId}-value`;
  const gridLabelId = `${controlId}-month`;
  const today = todayProp ?? dateInTimeZone(new Date());
  const selected = isDateOnly(value) ? value : null;

  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<DateOnly>(() => clamp(selected ?? today, min, max));
  const [view, setView] = useState<EthiopianMonth>(() => monthOf(focused));
  const gridRef = useRef<HTMLDivElement>(null);
  const moveFocus = useRef(false);

  function openPicker(next: boolean) {
    if (next) {
      const start = clamp(selected ?? today, min, max);
      setFocused(start);
      setView(monthOf(start));
      moveFocus.current = true;
    } else onBlur?.();
    setOpen(next);
  }

  useEffect(() => {
    if (!open || !moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [open, focused, view]);

  function focusDate(date: DateOnly) {
    const next = clamp(date, min, max);
    setFocused(next);
    setView(monthOf(next));
    moveFocus.current = true;
  }

  function choose(date: DateOnly) {
    onChange(date);
    setOpen(false);
    onBlur?.();
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const dow = dayOfWeek(focused);
    const moves: Record<string, () => DateOnly> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -dow),
      End: () => addDays(focused, 6 - dow),
      PageUp: () => shiftMonth(focused, event.shiftKey ? -ETHIOPIAN_MONTH_COUNT : -1),
      PageDown: () => shiftMonth(focused, event.shiftKey ? ETHIOPIAN_MONTH_COUNT : 1),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    focusDate(move());
  }

  const outOfRange = (date: DateOnly) => Boolean((min && date < min) || (max && date > max));
  const firstOfView = fromEthiopian({ ...view, day: 1 });
  const length = ethiopianMonthLength(view.year, view.month);
  const days = Array.from({ length }, (_, i) => addDays(firstOfView, i));
  const leading = dayOfWeek(firstOfView);

  const yearMin = toEthiopian(min ?? addDays(today, -365 * 10)).year;
  const yearMax = toEthiopian(max ?? addDays(today, 365 * 2)).year;
  const years = Array.from({ length: Math.max(1, yearMax - yearMin + 1) }, (_, i) => yearMin + i);
  const canGoBack = !min || fromEthiopian({ ...view, day: 1 }) > min;
  const canGoForward = !max || addDays(firstOfView, length - 1) < max;

  function showMonth(next: EthiopianMonth) {
    setView(next);
    const day = Math.min(toEthiopian(focused).day, ethiopianMonthLength(next.year, next.month));
    setFocused(clamp(fromEthiopian({ ...next, day }), min, max));
  }

  const display = selected ? f.date(selected) : (placeholder ?? t("common.datePicker.choose"));

  return (
    <Popover.Root open={open} onOpenChange={openPicker}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={controlId}
          data-value={value}
          aria-haspopup="dialog"
          aria-label={ariaLabel ? `${ariaLabel}, ${display}` : undefined}
          aria-labelledby={ariaLabel ? undefined : `${labelledBy ?? `${controlId}-label`} ${valueId}`}
          {...aria}
          className={cn(
            controlClasses,
            "flex h-11 cursor-pointer items-center justify-between gap-2 px-3 text-left",
            !selected && "text-fg-subtle",
            className,
          )}
        >
          <span id={valueId} className="truncate">
            {display}
          </span>
          <CalendarDays aria-hidden className="text-fg-muted size-[18px] shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => event.preventDefault()}
          aria-label={t("common.datePicker.label")}
          className={cn(
            "border-line bg-surface text-fg shadow-popover z-50 w-[19.5rem] rounded-xl border p-3",
            "data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in",
          )}
        >
          <div className="mb-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => showMonth(addEthiopianMonths(view, -1))}
              disabled={!canGoBack}
              aria-label={t("common.datePicker.previousMonth")}
              className="text-fg-muted hover:bg-tint hover:text-fg flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft aria-hidden className="size-5" />
            </button>
            <select
              aria-label={t("common.datePicker.month")}
              value={view.month}
              onChange={(event) => showMonth({ year: view.year, month: Number(event.target.value) })}
              className="hover:bg-tint min-w-0 flex-1 cursor-pointer rounded-lg bg-transparent px-1.5 py-1.5 text-sm font-semibold"
            >
              {ETHIOPIAN_MONTH_NAMES[locale].map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label={t("common.datePicker.year")}
              value={view.year}
              onChange={(event) => showMonth({ year: Number(event.target.value), month: view.month })}
              className="hover:bg-tint w-[4.75rem] cursor-pointer rounded-lg bg-transparent px-1.5 py-1.5 text-sm font-semibold tabular-nums"
            >
              {(years.includes(view.year) ? years : [...years, view.year].sort((a, b) => a - b)).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => showMonth(addEthiopianMonths(view, 1))}
              disabled={!canGoForward}
              aria-label={t("common.datePicker.nextMonth")}
              className="text-fg-muted hover:bg-tint hover:text-fg flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight aria-hidden className="size-5" />
            </button>
          </div>

          <p id={gridLabelId} className="sr-only" aria-live="polite">
            {f.monthYear(view)}
          </p>
          <div role="grid" aria-labelledby={gridLabelId} ref={gridRef} onKeyDown={onGridKeyDown}>
            <div role="row" className="grid grid-cols-7">
              {WEEKDAY_SHORT_NAMES[locale].map((name, index) => (
                <span
                  key={name}
                  role="columnheader"
                  aria-label={WEEKDAY_NAMES[locale][index]}
                  className="text-fg-subtle py-1 text-center text-[11px] font-semibold"
                >
                  {name}
                </span>
              ))}
            </div>
            {Array.from({ length: Math.ceil((leading + length) / 7) }, (_, week) => (
              <div role="row" key={week} className="grid grid-cols-7">
                {Array.from({ length: 7 }, (_, column) => {
                  const date = days[week * 7 + column - leading];
                  if (!date) return <span role="gridcell" key={column} />;
                  const isSelected = date === selected;
                  const isToday = date === today;
                  const disabledDay = outOfRange(date);
                  return (
                    <span role="gridcell" key={column} aria-selected={isSelected}>
                      <button
                        type="button"
                        data-date={date}
                        tabIndex={date === focused ? 0 : -1}
                        disabled={disabledDay}
                        aria-current={isToday ? "date" : undefined}
                        aria-label={`${f.weekday(date)}, ${f.date(date)}`}
                        onClick={() => choose(date)}
                        onFocus={() => setFocused(date)}
                        className={cn(
                          "flex h-9 w-full cursor-pointer items-center justify-center rounded-lg text-sm tabular-nums transition-colors",
                          "focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-1",
                          "disabled:text-fg-subtle/60 disabled:cursor-not-allowed disabled:line-through",
                          isSelected
                            ? "bg-primary text-on-primary font-semibold"
                            : "text-fg hover:bg-tint enabled:hover:text-fg",
                          isToday && !isSelected && "ring-primary text-primary font-semibold ring-1 ring-inset",
                        )}
                      >
                        {toEthiopian(date).day}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="border-line mt-2 flex items-center justify-between gap-2 border-t pt-2">
            <span className="text-fg-muted text-xs">{f.monthYear(view)}</span>
            <button
              type="button"
              onClick={() => choose(today)}
              disabled={outOfRange(today)}
              className="text-link cursor-pointer rounded-md px-2 py-1 text-sm font-semibold hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("common.today")}
            </button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
