/**
 * Framework-agnostic translation and formatting. Used by React components (via
 * the provider) and by the mock API, which localizes its messages the way the
 * real backend does from the Accept-Language header.
 */

import type { DateOnly } from "@gymflow/shared/domain/dates";
import type { EthiopianMonth } from "@gymflow/shared/domain/ethiopian-calendar";
import { formatAmount, type Money } from "@gymflow/shared/domain/money";
import * as calendar from "@gymflow/shared/i18n/format";
import { INTL_LOCALES, type Locale } from "./config";
import { am } from "./messages/am";
import { en } from "./messages/en";
import type { MessageKey, Messages, MessageValues, Plural } from "./types";

const CATALOGS: Record<Locale, Messages> = { am, en };

/**
 * Display formatters. Dates are shown in the Ethiopian calendar in both
 * languages; times use Ethiopian time in Amharic and the 24-hour clock in English.
 */
export interface Formatters {
  /** "መስከረም 27, 2019" / "Meskerem 27, 2019" */
  date(date: DateOnly): string;
  /** With the era, for headings and receipts: "መስከረም 27, 2019 ዓ.ም" / "Meskerem 27, 2019 E.C." */
  longDate(date: DateOnly): string;
  /** Chart axes: "መስከረም 27" / "Mes 27" */
  shortDate(date: DateOnly): string;
  /** "መስከረም 2019" / "Meskerem 2019" */
  monthYear(month: EthiopianMonth): string;
  /** "ረቡዕ" / "Wednesday" */
  weekday(date: DateOnly): string;
  /** "መስከረም 21 – ጥቅምት 20, 2019" */
  dateRange(from: DateOnly, to: DateOnly): string;
  /** Instant at the gym: "መስከረም 27, 2019 · ከቀኑ 8:20" / "Meskerem 27, 2019 · 14:20" */
  timestamp(iso: string): string;
  /** "ከቀኑ 8:20" / "14:20" */
  time(iso: string): string;
  /** "1,500.00 ETB" / "1,500.00 ብር" */
  money(value: Money): string;
  /** "1,500.00" */
  amount(value: Money): string;
  /** "ETB" / "ብር" */
  currency: string;
  /** Grouped integer: "1,234" */
  number(value: number): string;
  /** Axis labels: "20k" / "20ሺ" */
  compact(value: number): string;
  /** "30 days" / "30 ቀናት" */
  days(count: number): string;
  /** "Monthly — 30 days" (plan names are data and stay as entered) */
  plan(name: string, durationDays: number): string;
}

export interface Translator {
  locale: Locale;
  t: (key: MessageKey, values?: MessageValues) => string;
  f: Formatters;
}

function resolve(messages: Messages, key: string): string | Plural | undefined {
  let node: unknown = messages;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" || (node !== null && typeof node === "object" && "other" in node)
    ? (node as string | Plural)
    : undefined;
}

function interpolate(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    if (value === undefined) return match;
    return typeof value === "number" ? value.toLocaleString("en-US") : value;
  });
}

function createFormatters(locale: Locale, t: Translator["t"]): Formatters {
  const formatters: Formatters = {
    date: (date) => calendar.formatDate(date, locale),
    longDate: (date) => calendar.formatDate(date, locale, { era: true }),
    shortDate: (date) => calendar.formatShortDate(date, locale),
    monthYear: (month) => calendar.formatMonthYear(month, locale),
    weekday: (date) => calendar.formatWeekday(date, locale),
    dateRange: (from, to) => calendar.formatDateRange(from, to, locale),
    timestamp: (iso) => calendar.formatTimestamp(iso, locale),
    time: (iso) => calendar.formatTime(iso, locale),
    money(value) {
      return `${formatAmount(value)} ${t("common.currency")}`;
    },
    amount: formatAmount,
    currency: t("common.currency"),
    number(value) {
      return value.toLocaleString("en-US");
    },
    compact(value) {
      const abs = Math.abs(value);
      const trim = (text: string) => (text.endsWith(".0") ? text.slice(0, -2) : text);
      if (abs >= 1_000_000) return `${trim((value / 1_000_000).toFixed(1))}${t("common.millionSuffix")}`;
      if (abs >= 1_000) return `${trim((value / 1_000).toFixed(1))}${t("common.thousandSuffix")}`;
      return String(Math.round(value));
    },
    days(count) {
      return t("common.days", { count });
    },
    plan(name, durationDays) {
      return `${name} — ${formatters.days(durationDays)}`;
    },
  };
  return formatters;
}

const cache = new Map<Locale, Translator>();

export function getTranslator(locale: Locale): Translator {
  const cached = cache.get(locale);
  if (cached) return cached;

  const catalog = CATALOGS[locale];
  const pluralRules = new Intl.PluralRules(INTL_LOCALES[locale]);

  const t: Translator["t"] = (key, values) => {
    const leaf = resolve(catalog, key) ?? resolve(CATALOGS.en, key);
    if (leaf === undefined) {
      if (process.env.NODE_ENV !== "production") console.warn(`[i18n] Missing message: ${key}`);
      return key;
    }
    if (typeof leaf === "string") return interpolate(leaf, values);
    const count = Number(values?.count ?? 0);
    return interpolate(pluralRules.select(count) === "one" ? leaf.one : leaf.other, values);
  };

  const translator: Translator = { locale, t, f: createFormatters(locale, t) };
  cache.set(locale, translator);
  return translator;
}
