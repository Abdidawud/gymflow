/**
 * Locale-aware display of dates and times in the Ethiopian calendar, shared
 * by the web app and the API (error messages, emails) so both read the same.
 *
 *   am: መስከረም 27, 2019 · ከቀኑ 8:20   (Ethiopian time of day)
 *   en: Meskerem 27, 2019 · 14:20      (24-hour clock)
 *
 * Digits stay Arabic numerals in both languages, as on Ethiopian receipts and forms.
 */

import { GYM_TIMEZONE, toDayNumber, type DateOnly } from "../domain/dates";
import {
  toEthiopian,
  toEthiopianTime,
  type EthiopianDayPeriod,
  type EthiopianMonth,
} from "../domain/ethiopian-calendar";
import type { Locale } from "./locales";

/** Month names (CLDR spellings), Meskerem first; index 12 is Pagume. */
export const ETHIOPIAN_MONTH_NAMES: Record<Locale, readonly string[]> = {
  am: ["መስከረም", "ጥቅምት", "ኅዳር", "ታኅሣሥ", "ጥር", "የካቲት", "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜን"],
  en: [
    "Meskerem",
    "Tekemt",
    "Hedar",
    "Tahsas",
    "Ter",
    "Yekatit",
    "Megabit",
    "Miazia",
    "Genbot",
    "Sene",
    "Hamle",
    "Nehasse",
    "Pagumen",
  ],
};

/** Compact month names for chart axes; Amharic names are already short. */
const SHORT_MONTH_NAMES: Record<Locale, readonly string[]> = {
  am: ETHIOPIAN_MONTH_NAMES.am,
  en: ["Mes", "Tek", "Hed", "Tah", "Ter", "Yek", "Meg", "Mia", "Gen", "Sen", "Ham", "Neh", "Pag"],
};

/** Weekday names, Sunday first. */
export const WEEKDAY_NAMES: Record<Locale, readonly string[]> = {
  am: ["እሑድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

/** Column headers for calendar grids, Sunday first. */
export const WEEKDAY_SHORT_NAMES: Record<Locale, readonly string[]> = {
  am: ["እሑድ", "ሰኞ", "ማክሰ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

/** "Year of Mercy" (ዓመተ ምሕረት) / Ethiopian Calendar. */
export const ERA_LABEL: Record<Locale, string> = { am: "ዓ.ም", en: "E.C." };

const DAY_PERIOD_LABELS: Record<EthiopianDayPeriod, string> = {
  night: "ከሌሊቱ",
  morning: "ከጠዋቱ",
  day: "ከቀኑ",
  evening: "ከምሽቱ",
};

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function dayOfWeek(date: DateOnly): number {
  return (((toDayNumber(date) + 4) % 7) + 7) % 7;
}

export function monthName(month: number, locale: Locale): string {
  return ETHIOPIAN_MONTH_NAMES[locale][month - 1];
}

/** "መስከረም 27" / "Meskerem 27" */
export function formatMonthDay(date: DateOnly, locale: Locale): string {
  const e = toEthiopian(date);
  return `${monthName(e.month, locale)} ${e.day}`;
}

/** "መስከረም 27, 2019" — with `era`: "መስከረም 27, 2019 ዓ.ም" / "Meskerem 27, 2019 E.C." */
export function formatDate(date: DateOnly, locale: Locale, options: { era?: boolean } = {}): string {
  const e = toEthiopian(date);
  const text = `${monthName(e.month, locale)} ${e.day}, ${e.year}`;
  return options.era ? `${text} ${ERA_LABEL[locale]}` : text;
}

/** Chart axes: "መስከረም 27" / "Mes 27" */
export function formatShortDate(date: DateOnly, locale: Locale): string {
  const e = toEthiopian(date);
  return `${SHORT_MONTH_NAMES[locale][e.month - 1]} ${e.day}`;
}

/** "መስከረም 2019" / "Meskerem 2019" */
export function formatMonthYear({ year, month }: EthiopianMonth, locale: Locale): string {
  return `${monthName(month, locale)} ${year}`;
}

/** "ረቡዕ" / "Wednesday" */
export function formatWeekday(date: DateOnly, locale: Locale): string {
  return WEEKDAY_NAMES[locale][dayOfWeek(date)];
}

/** "መስከረም 1 – 27, 2019", "መስከረም 21 – ጥቅምት 20, 2019", with both years when they differ. */
export function formatDateRange(from: DateOnly, to: DateOnly, locale: Locale): string {
  const a = toEthiopian(from);
  const b = toEthiopian(to);
  if (a.year !== b.year) return `${formatDate(from, locale)} – ${formatDate(to, locale)}`;
  if (a.month === b.month) return `${monthName(a.month, locale)} ${a.day} – ${b.day}, ${b.year}`;
  return `${formatMonthDay(from, locale)} – ${formatDate(to, locale)}`;
}

const gymClockFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: GYM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Calendar date and wall-clock time of an instant at the gym (Africa/Addis_Ababa). */
export function gymClock(iso: string): {
  date: DateOnly;
  hour: number;
  minute: number;
} {
  const parts = Object.fromEntries(gymClockFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** Amharic: Ethiopian time "ከቀኑ 8:20"; English: 24-hour "14:20". */
export function formatTime(iso: string, locale: Locale): string {
  const { hour, minute } = gymClock(iso);
  const mm = String(minute).padStart(2, "0");
  if (locale === "en") return `${String(hour).padStart(2, "0")}:${mm}`;
  const time = toEthiopianTime(hour, minute);
  return `${DAY_PERIOD_LABELS[time.period]} ${time.hour}:${mm}`;
}

/** "መስከረም 27, 2019 · ከቀኑ 8:20" / "Meskerem 27, 2019 · 14:20" */
export function formatTimestamp(iso: string, locale: Locale): string {
  return `${formatDate(gymClock(iso).date, locale)} · ${formatTime(iso, locale)}`;
}
