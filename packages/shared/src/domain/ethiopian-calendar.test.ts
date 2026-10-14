import { describe, expect, it } from "vitest";
import { addDays, eachDay } from "./dates";
import {
  addEthiopianMonths,
  endOfEthiopianMonth,
  ethiopianMonthLength,
  fromEthiopian,
  isEthiopianLeapYear,
  isValidEthiopianDate,
  startOfEthiopianMonth,
  toEthiopian,
  toEthiopianTime,
} from "./ethiopian-calendar";

/** ICU's Ethiopic calendar, used only as an independent oracle in tests. */
const icu = new Intl.DateTimeFormat("en-US-u-ca-ethiopic", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function icuEthiopian(date: string) {
  const parts = Object.fromEntries(
    icu
      .formatToParts(new Date(`${date}T00:00:00Z`))
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

describe("Ethiopian calendar", () => {
  it("matches the design fixture date and known holidays", () => {
    expect(toEthiopian("2026-10-07")).toEqual({
      year: 2019,
      month: 1,
      day: 27,
    });
    expect(toEthiopian("2026-09-11")).toEqual({ year: 2019, month: 1, day: 1 }); // Enkutatash
    expect(toEthiopian("2023-09-12")).toEqual({ year: 2016, month: 1, day: 1 }); // after leap year 2015
    expect(toEthiopian("2023-09-11")).toEqual({
      year: 2015,
      month: 13,
      day: 6,
    }); // Pagume 6
    expect(toEthiopian("2027-01-07")).toEqual({
      year: 2019,
      month: 4,
      day: 29,
    }); // Genna
    expect(toEthiopian("2027-01-19")).toEqual({
      year: 2019,
      month: 5,
      day: 11,
    }); // Timket
  });

  it("agrees with ICU for every day from 1900 to 2100", () => {
    const days = eachDay("1900-01-01", "2100-12-31");
    for (const date of days) {
      const expected = icuEthiopian(date);
      const actual = toEthiopian(date);
      if (
        actual.year !== expected.year ||
        actual.month !== expected.month ||
        actual.day !== expected.day
      ) {
        throw new Error(
          `${date}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
  });

  it("round-trips every day", () => {
    let date = "1950-01-01";
    for (let i = 0; i < 40_000; i++) {
      expect(fromEthiopian(toEthiopian(date))).toBe(date);
      date = addDays(date, 1);
    }
  });

  it("knows month lengths and leap years", () => {
    expect(isEthiopianLeapYear(2015)).toBe(true);
    expect(isEthiopianLeapYear(2019)).toBe(true);
    expect(isEthiopianLeapYear(2018)).toBe(false);
    expect(ethiopianMonthLength(2019, 1)).toBe(30);
    expect(ethiopianMonthLength(2019, 13)).toBe(6);
    expect(ethiopianMonthLength(2018, 13)).toBe(5);
    expect(isValidEthiopianDate({ year: 2018, month: 13, day: 6 })).toBe(false);
    expect(isValidEthiopianDate({ year: 2019, month: 13, day: 6 })).toBe(true);
    expect(() => fromEthiopian({ year: 2018, month: 13, day: 6 })).toThrow(
      RangeError,
    );
  });

  it("finds Ethiopian month boundaries", () => {
    expect(startOfEthiopianMonth("2026-10-07")).toBe("2026-09-11");
    expect(endOfEthiopianMonth("2026-10-07")).toBe("2026-10-10");
    expect(startOfEthiopianMonth("2026-09-08")).toBe("2026-09-06"); // Pagume 2018
    expect(endOfEthiopianMonth("2026-09-08")).toBe("2026-09-10");
  });

  it("moves across months and years", () => {
    expect(addEthiopianMonths({ year: 2019, month: 1 }, -1)).toEqual({
      year: 2018,
      month: 13,
    });
    expect(addEthiopianMonths({ year: 2018, month: 13 }, 1)).toEqual({
      year: 2019,
      month: 1,
    });
    expect(addEthiopianMonths({ year: 2019, month: 5 }, 26)).toEqual({
      year: 2021,
      month: 5,
    });
  });

  it("converts clock time to Ethiopian time", () => {
    expect(toEthiopianTime(8, 20)).toEqual({
      hour: 2,
      minute: 20,
      period: "morning",
    });
    expect(toEthiopianTime(14, 20)).toEqual({
      hour: 8,
      minute: 20,
      period: "day",
    });
    expect(toEthiopianTime(6, 0)).toEqual({
      hour: 12,
      minute: 0,
      period: "morning",
    });
    expect(toEthiopianTime(12, 0)).toEqual({
      hour: 6,
      minute: 0,
      period: "day",
    });
    expect(toEthiopianTime(18, 30)).toEqual({
      hour: 12,
      minute: 30,
      period: "evening",
    });
    expect(toEthiopianTime(0, 15)).toEqual({
      hour: 6,
      minute: 15,
      period: "night",
    });
    expect(toEthiopianTime(5, 59)).toEqual({
      hour: 11,
      minute: 59,
      period: "night",
    });
  });
});
