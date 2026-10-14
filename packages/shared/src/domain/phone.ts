/**
 * Ethiopian phone numbers. Staff may type local ("0911 234 567") or
 * international ("+251 911 234 567") forms; storage is canonical +251…
 * so duplicates are detected after normalization (design.md §10).
 */

export type PhoneKind = "mobile" | "any";

/**
 * Returns the canonical +251XXXXXXXXX form, or null when the input is not a
 * valid Ethiopian number. Mobile numbers start with 9 (Ethio Telecom) or
 * 7 (Safaricom) after the country code.
 */
export function normalizeEthiopianPhone(input: string, kind: PhoneKind = "mobile"): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(compact)) return null;

  let national: string;
  if (compact.startsWith("+251")) national = compact.slice(4);
  else if (compact.startsWith("00251")) national = compact.slice(5);
  else if (compact.startsWith("251") && compact.length === 12) national = compact.slice(3);
  else if (compact.startsWith("0") && compact.length === 10) national = compact.slice(1);
  else if (compact.length === 9) national = compact;
  else return null;

  if (!/^\d{9}$/.test(national)) return null;
  if (kind === "mobile" && !/^[79]/.test(national)) return null;
  if (kind === "any" && national.startsWith("0")) return null;
  return `+251${national}`;
}

/** "+251911234567" → "0911 234 567"; leaves unrecognized values unchanged. */
export function formatPhone(canonical: string | null | undefined): string {
  if (!canonical) return "";
  const match = /^\+251(\d{9})$/.exec(canonical);
  if (!match) return canonical;
  const national = `0${match[1]}`;
  if (/^0[79]/.test(national)) {
    return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
  }
  // Landlines: area code + subscriber, e.g. 022 111 8920.
  return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

/** "+251911234567" → "+251 911 234 567" */
export function formatPhoneInternational(canonical: string): string {
  const match = /^\+251(\d{3})(\d{3})(\d{3})$/.exec(canonical);
  return match ? `+251 ${match[1]} ${match[2]} ${match[3]}` : canonical;
}

/**
 * Digits used to match a search query against phone numbers, independent of
 * the format the staff member typed. Returns null when the query is not phone-like.
 */
export function phoneSearchDigits(query: string): string | null {
  const compact = query.replace(/[\s\-().]/g, "");
  if (!/^\+?\d{3,}$/.test(compact)) return null;
  let digits = compact.replace(/^\+/, "");
  if (digits.startsWith("251")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.length > 0 ? digits : null;
}
