/**
 * Supported interface languages: English (the default) and Amharic, chosen
 * from the language switcher and saved per staff account.
 */

import { isLocale, LOCALES, type Locale } from "@gymflow/shared/i18n/locales";

export { isLocale, LOCALES, type Locale };

/** Language before anyone chooses one: English unless NEXT_PUBLIC_DEFAULT_LOCALE=am. */
export const DEFAULT_LOCALE: Locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE === "am" ? "am" : "en";

export const LOCALE_STORAGE_KEY = "gymflow-locale";

/** Each language is named in itself in the switcher. */
export const LOCALE_LABELS: Record<Locale, string> = { am: "አማርኛ", en: "English" };

/** BCP 47 tags for Intl formatting (plural rules, numbers). Dates use the Ethiopian calendar (shared/i18n/format). */
export const INTL_LOCALES: Record<Locale, string> = { am: "am-ET", en: "en-US" };

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
