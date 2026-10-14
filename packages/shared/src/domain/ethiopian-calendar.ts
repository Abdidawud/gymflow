/**
 * Ethiopian (Ge'ez) calendar, the calendar GymFlow shows and accepts.
 *
 * Dates are still stored and exchanged as ISO `YYYY-MM-DD` values (the
 * proleptic Gregorian calendar PostgreSQL uses), so day arithmetic, sorting
 * and "30 days = Monthly" stay exact. This module converts between the two
 * calendars for display, date pickers and month boundaries.
 *
 * The Ethiopian year has 12 months of 30 days plus Pagume (ጳጉሜን), which has
 * 5 days, or 6 in a leap year (year % 4 === 3). The year starts on Meskerem 1,
 * which falls on September 11 (September 12 after an Ethiopian leap year).
 */

import { fromDayNumber, toDayNumber, type DateOnly } from "./dates";

export interface EthiopianDate {
  year: number;
  /** 1–13; 13 is Pagume. */
  month: number;
  day: number;
}

export interface EthiopianMonth {
  year: number;
  month: number;
}

export const ETHIOPIAN_MONTH_COUNT = 13;

/** Julian Day Number offset of the Amete Mihret (Incarnation) era. */
const AMETE_MIHRET_OFFSET = 1_723_856;
/** Julian Day Number of 1970-01-01, the origin of `toDayNumber`. */
const UNIX_EPOCH_JDN = 2_440_588;

const floorDiv = (a: number, b: number) => Math.floor(a / b);
const mod = (a: number, b: number) => ((a % b) + b) % b;

export function isEthiopianLeapYear(year: number): boolean {
  return mod(year, 4) === 3;
}

export function ethiopianMonthLength(year: number, month: number): number {
  if (month < 1 || month > ETHIOPIAN_MONTH_COUNT) throw new RangeError(`Invalid Ethiopian month: ${month}`);
  if (month < 13) return 30;
  return isEthiopianLeapYear(year) ? 6 : 5;
}

export function isValidEthiopianDate({ year, month, day }: EthiopianDate): boolean {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= ETHIOPIAN_MONTH_COUNT &&
    day >= 1 &&
    day <= ethiopianMonthLength(year, month)
  );
}

function toJulianDay({ year, month, day }: EthiopianDate): number {
  return AMETE_MIHRET_OFFSET + 365 + 365 * (year - 1) + floorDiv(year, 4) + 30 * month + day - 31;
}

function fromJulianDay(jdn: number): EthiopianDate {
  const r = mod(jdn - AMETE_MIHRET_OFFSET, 1461);
  const n = mod(r, 365) + 365 * floorDiv(r, 1460);
  return {
    year: 4 * floorDiv(jdn - AMETE_MIHRET_OFFSET, 1461) + floorDiv(r, 365) - floorDiv(r, 1460),
    month: floorDiv(n, 30) + 1,
    day: mod(n, 30) + 1,
  };
}

/** ISO date → Ethiopian date. */
export function toEthiopian(date: DateOnly): EthiopianDate {
  return fromJulianDay(toDayNumber(date) + UNIX_EPOCH_JDN);
}

/** Ethiopian date → ISO date. Throws on an impossible date such as Pagume 6 in a common year. */
export function fromEthiopian(date: EthiopianDate): DateOnly {
  if (!isValidEthiopianDate(date)) {
    throw new RangeError(`Invalid Ethiopian date: ${date.year}-${date.month}-${date.day}`);
  }
  return fromDayNumber(toJulianDay(date) - UNIX_EPOCH_JDN);
}

/** First day of the Ethiopian month containing `date` (ISO). */
export function startOfEthiopianMonth(date: DateOnly): DateOnly {
  const { year, month } = toEthiopian(date);
  return fromEthiopian({ year, month, day: 1 });
}

/** Last day of the Ethiopian month containing `date` (ISO). */
export function endOfEthiopianMonth(date: DateOnly): DateOnly {
  const { year, month } = toEthiopian(date);
  return fromEthiopian({ year, month, day: ethiopianMonthLength(year, month) });
}

/** The month `delta` months after `month` (negative to go back), across years. */
export function addEthiopianMonths({ year, month }: EthiopianMonth, delta: number): EthiopianMonth {
  const index = year * ETHIOPIAN_MONTH_COUNT + (month - 1) + delta;
  return {
    year: floorDiv(index, ETHIOPIAN_MONTH_COUNT),
    month: mod(index, ETHIOPIAN_MONTH_COUNT) + 1,
  };
}

export function compareEthiopianMonths(a: EthiopianMonth, b: EthiopianMonth): number {
  return a.year - b.year || a.month - b.month;
}

// ---------------------------------------------------------------------------
// Ethiopian time of day. Hours are counted from dawn (06:00) and dusk (18:00):
// 08:20 is "2:20 in the morning", 14:20 is "8:20 in the day".
// ---------------------------------------------------------------------------

export type EthiopianDayPeriod = "night" | "morning" | "day" | "evening";

export interface EthiopianTime {
  /** 1–12 */
  hour: number;
  minute: number;
  period: EthiopianDayPeriod;
}

/** Converts a 24-hour clock time (local to the gym) to Ethiopian time. */
export function toEthiopianTime(hour24: number, minute: number): EthiopianTime {
  if (!Number.isInteger(hour24) || hour24 < 0 || hour24 > 23) throw new RangeError(`Invalid hour: ${hour24}`);
  const period: EthiopianDayPeriod = hour24 < 6 ? "night" : hour24 < 12 ? "morning" : hour24 < 18 ? "day" : "evening";
  return { hour: mod(hour24 + 6, 12) || 12, minute, period };
}
