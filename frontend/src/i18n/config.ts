/**
 * Supported interface languages. Amharic is the gym's working language and
 * the default; English is available from the language switcher.
 */

export const LOCALES = ["am", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "en" ? "en" : "am";

export const LOCALE_STORAGE_KEY = "gymflow-locale";

/** Each language is named in itself in the switcher. */
export const LOCALE_LABELS: Record<Locale, string> = { am: "አማርኛ", en: "English" };

/** BCP 47 tags for Intl formatting (Gregorian calendar in both languages). */
export const INTL_LOCALES: Record<Locale, string> = { am: "am-ET", en: "en-US" };

export function isLocale(value: unknown): value is Locale {
  return value === "am" || value === "en";
}

/** The language chosen on this device; the default during server rendering. */
export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
