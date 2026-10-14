/**
 * Supported interface languages: English (the default) and Amharic.
 */

export const LOCALES = ["en", "am"] as const;
export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return value === "am" || value === "en";
}
