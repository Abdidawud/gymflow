import type { DateOnly } from "../domain/dates";

/** The design fixtures are frozen at Oct 07, 2026 = Meskerem 27, 2019 E.C. (design.md §5). */
export const SEED_TODAY: DateOnly = "2026-10-07";

/** ISO timestamp for a gym-local date and time ("HH:MM"); Addis Ababa is UTC+3 all year. */
export function gymTimestamp(date: DateOnly, time: string): string {
  return new Date(`${date}T${time}:00+03:00`).toISOString();
}
