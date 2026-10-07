/**
 * Date-only helpers. Membership dates are calendar dates in the gym timezone
 * (design.md §5): they are carried as `YYYY-MM-DD` strings and all arithmetic
 * happens on whole days, never on local-time Date objects.
 */

export type DateOnly = string;

export const GYM_TIMEZONE = "Africa/Addis_Ababa";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== "string") return false;
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}

/** Days since 1970-01-01 for a date-only value. */
export function toDayNumber(date: DateOnly): number {
  const match = DATE_ONLY_RE.exec(date);
  if (!match) throw new RangeError(`Invalid date-only value: ${date}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY;
}

export function fromDayNumber(day: number): DateOnly {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: DateOnly, days: number): DateOnly {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  return toDayNumber(to) - toDayNumber(from);
}

export function compareDates(a: DateOnly, b: DateOnly): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: DateOnly, b: DateOnly): DateOnly {
  return a <= b ? a : b;
}

export function maxDate(a: DateOnly, b: DateOnly): DateOnly {
  return a >= b ? a : b;
}

export function startOfMonth(date: DateOnly): DateOnly {
  return `${date.slice(0, 7)}-01`;
}

/** Calendar date of an instant in the given timezone. */
export function dateInTimeZone(instant: Date, timeZone: string = GYM_TIMEZONE): DateOnly {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Inclusive list of dates from `from` to `to`. */
export function eachDay(from: DateOnly, to: DateOnly): DateOnly[] {
  const start = toDayNumber(from);
  const end = toDayNumber(to);
  const days: DateOnly[] = [];
  for (let day = start; day <= end; day++) days.push(fromDayNumber(day));
  return days;
}

// ---------------------------------------------------------------------------
// Display formatting (design.md §5: "Oct 07, 2026").
// Date-only values are formatted in UTC so the viewer's timezone never shifts them.
// ---------------------------------------------------------------------------

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "2-digit",
  year: "numeric",
});
const shortDateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "2-digit" });
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });

function toUtcDate(date: DateOnly): Date {
  return new Date(toDayNumber(date) * MS_PER_DAY);
}

/** "Oct 07, 2026" */
export function formatDate(date: DateOnly): string {
  return dateFormatter.format(toUtcDate(date));
}

/** "Oct 07" */
export function formatShortDate(date: DateOnly): string {
  return shortDateFormatter.format(toUtcDate(date));
}

/** "Wednesday" */
export function formatWeekday(date: DateOnly): string {
  return weekdayFormatter.format(toUtcDate(date));
}

/** "Oct 01 – Oct 30, 2026", or with both years when they differ. */
export function formatDateRange(from: DateOnly, to: DateOnly): string {
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `${formatShortDate(from)} – ${formatDate(to)}`;
  }
  return `${formatDate(from)} – ${formatDate(to)}`;
}

const timestampDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: GYM_TIMEZONE,
  month: "short",
  day: "2-digit",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: GYM_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Timestamps are shown in the gym timezone: "Oct 07, 2026 · 14:20". */
export function formatTimestamp(iso: string): string {
  const instant = new Date(iso);
  return `${timestampDateFormatter.format(instant)} · ${timeFormatter.format(instant)}`;
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

/** "1 day", "23 days" */
export function pluralizeDays(count: number): string {
  return `${count} ${Math.abs(count) === 1 ? "day" : "days"}`;
}
