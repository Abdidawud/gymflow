/**
 * Business time. "Today" is the calendar date in Africa/Addis_Ababa, never the
 * server's UTC date (backend design §15). In development and tests the date can
 * be frozen (FIXED_TODAY) so the demo data matches the design fixtures; the
 * time of day keeps moving so new records still sort naturally.
 */

import { dateInTimeZone, type DateOnly } from "@gymflow/shared/domain/dates";

export interface Clock {
  /** Timestamp for business records (payments, members, audit). */
  now(): Date;
  /** Gym calendar date. */
  today(): DateOnly;
}

const ADDIS_OFFSET_MS = 3 * 3_600_000; // UTC+3 all year, no daylight saving

export function createClock(fixedToday: DateOnly | null): Clock {
  if (!fixedToday) {
    return { now: () => new Date(), today: () => dateInTimeZone(new Date()) };
  }
  return {
    now() {
      const timeOfDay = new Date(Date.now() + ADDIS_OFFSET_MS).toISOString().slice(11, 23);
      return new Date(`${fixedToday}T${timeOfDay}+03:00`);
    },
    today: () => fixedToday,
  };
}
