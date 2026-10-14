/** Input clean-up shared by every endpoint (same rules as the web app's forms). */

/** Trims and collapses inner whitespace; empty becomes null. */
export function clean(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

/** Trims but keeps line breaks (notes, descriptions); empty becomes null. */
export function cleanMultiline(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim().replace(/\r\n/g, "\n");
  return trimmed.length > 0 ? trimmed : null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}
