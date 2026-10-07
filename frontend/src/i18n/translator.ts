/**
 * Framework-agnostic translation and formatting. Used by React components (via
 * the provider) and by the mock API, which localizes its messages the way the
 * real backend does from the Accept-Language header.
 */

import { toDayNumber, type DateOnly } from "@/lib/domain/dates";
import { formatAmount, type Money } from "@/lib/domain/money";
import { INTL_LOCALES, type Locale } from "./config";
import { am } from "./messages/am";
import { en } from "./messages/en";
import type { MessageKey, Messages, MessageValues, Plural } from "./types";

const CATALOGS: Record<Locale, Messages> = { am, en };
const GYM_TIMEZONE = "Africa/Addis_Ababa";
const MS_PER_DAY = 86_400_000;

export interface Formatters {
  /** "Oct 07, 2026" / "ኦክቶ 07, 2026" */
  date(date: DateOnly): string;
  /** "Oct 07" */
  shortDate(date: DateOnly): string;
  /** "Wednesday" / "ረቡዕ" */
  weekday(date: DateOnly): string;
  /** "Oct 01 – Oct 30, 2026" */
  dateRange(from: DateOnly, to: DateOnly): string;
  /** Instant in the gym timezone: "Oct 07, 2026 · 14:20" */
  timestamp(iso: string): string;
  /** "14:20" in the gym timezone */
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

function utc(date: DateOnly): Date {
  return new Date(toDayNumber(date) * MS_PER_DAY);
}

function createFormatters(locale: Locale, t: Translator["t"]): Formatters {
  const intl = INTL_LOCALES[locale];
  const dateFormat = new Intl.DateTimeFormat(intl, {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const weekdayFormat = new Intl.DateTimeFormat(intl, { timeZone: "UTC", weekday: "long" });
  const instantFormat = new Intl.DateTimeFormat(intl, {
    timeZone: GYM_TIMEZONE,
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat("en-GB", {
    timeZone: GYM_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // One consistent "Mon DD, YYYY" layout in both languages.
  function parts(format: Intl.DateTimeFormat, instant: Date) {
    const found = Object.fromEntries(format.formatToParts(instant).map((p) => [p.type, p.value]));
    return { month: found.month ?? "", day: found.day ?? "", year: found.year ?? "" };
  }

  const formatters: Formatters = {
    date(date) {
      const p = parts(dateFormat, utc(date));
      return `${p.month} ${p.day}, ${p.year}`;
    },
    shortDate(date) {
      const p = parts(dateFormat, utc(date));
      return `${p.month} ${p.day}`;
    },
    weekday(date) {
      return weekdayFormat.format(utc(date));
    },
    dateRange(from, to) {
      return from.slice(0, 4) === to.slice(0, 4)
        ? `${formatters.shortDate(from)} – ${formatters.date(to)}`
        : `${formatters.date(from)} – ${formatters.date(to)}`;
    },
    timestamp(iso) {
      const instant = new Date(iso);
      const p = parts(instantFormat, instant);
      return `${p.month} ${p.day}, ${p.year} · ${timeFormat.format(instant)}`;
    },
    time(iso) {
      return timeFormat.format(new Date(iso));
    },
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
