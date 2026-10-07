import { dateInTimeZone, isDateOnly, type DateOnly } from "@/lib/domain/dates";

/** The design fixtures are frozen at Oct 07, 2026 (design.md §5). */
export const SEED_TODAY: DateOnly = "2026-10-07";

const configured = process.env.NEXT_PUBLIC_MOCK_TODAY;

/**
 * Mock "today" in the gym timezone. Defaults to the fixture date so the demo
 * matches the design; set NEXT_PUBLIC_MOCK_TODAY=live to follow the real date,
 * or to a YYYY-MM-DD value to test another day.
 */
export function mockToday(): DateOnly {
  if (configured === "live") return dateInTimeZone(new Date());
  if (configured && isDateOnly(configured)) return configured;
  return SEED_TODAY;
}

/** Current instant, placed on the mock date at the real Addis Ababa time of day. */
export function mockNow(): string {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  const time = eat.toISOString().slice(11, 19);
  return new Date(`${mockToday()}T${time}+03:00`).toISOString();
}

/** ISO timestamp for a gym-local date and time ("HH:MM"). */
export function gymTimestamp(date: DateOnly, time: string): string {
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}
