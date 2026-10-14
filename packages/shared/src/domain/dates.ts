/**
 * Date-only helpers. Membership dates are calendar dates in the gym timezone
 * (design.md §5): they are carried as ISO `YYYY-MM-DD` strings and all
 * arithmetic happens on whole days, never on local-time Date objects.
 * People see them in the Ethiopian calendar (ethiopian-calendar.ts, i18n/format.ts).
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
