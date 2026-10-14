/**
 * Supported interface languages. Amharic is the gym's working language and
 * the default; English is available from the language switcher.
 */

export const LOCALES = ["am", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return value === "am" || value === "en";
}
