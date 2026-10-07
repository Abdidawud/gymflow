/**
 * ETB money helpers. The API carries money as decimal strings ("1500.00");
 * arithmetic is done in integer cents so totals never suffer binary
 * floating-point drift (backend design §14).
 */

export type Money = string;
export const CURRENCY = "ETB";

const MONEY_RE = /^-?\d+(\.\d{1,2})?$/;

export function isMoneyString(value: string): boolean {
  return MONEY_RE.test(value.trim());
}

export function toCents(value: Money): number {
  const trimmed = value.trim();
  if (!MONEY_RE.test(trimmed)) throw new RangeError(`Invalid money value: ${value}`);
  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = trimmed.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function fromCents(cents: number): Money {
  if (!Number.isSafeInteger(cents)) throw new RangeError(`Unsafe cents value: ${cents}`);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

export function sumMoney(values: Money[]): Money {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0));
}

/** Average rounded half-up to the cent; zero when there are no items (design.md §16). */
export function averageMoney(total: Money, count: number): Money {
  if (count <= 0) return "0.00";
  const cents = toCents(total);
  return fromCents(Math.sign(cents) * Math.round(Math.abs(cents) / count));
}

const groupFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** "1,500.00" — amount without currency. */
export function formatAmount(value: Money): string {
  const cents = toCents(value);
  const abs = Math.abs(cents);
  const whole = groupFormatter.format(Math.floor(abs / 100));
  return `${cents < 0 ? "-" : ""}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** "1,500.00 ETB" (design.md §5). */
export function formatMoney(value: Money): string {
  return `${formatAmount(value)} ${CURRENCY}`;
}

/** Compact axis labels: 0, 5k, 12.5k, 1.2M. */
export function formatCompactAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${trimZero((value / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${trimZero((value / 1_000).toFixed(1))}k`;
  return String(Math.round(value));
}

function trimZero(text: string): string {
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

/** Validates staff input for plan prices: positive, at most two decimals. */
export function parsePriceInput(input: string): Money | null {
  const cleaned = input.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = toCents(cleaned);
  if (cents <= 0) return null;
  return fromCents(cents);
}
