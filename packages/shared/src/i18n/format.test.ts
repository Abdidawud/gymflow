import { describe, expect, it } from "vitest";
import {
  dayOfWeek,
  formatDate,
  formatDateRange,
  formatMonthYear,
  formatShortDate,
  formatTime,
  formatTimestamp,
  formatWeekday,
} from "./format";

describe("Ethiopian date display", () => {
  it("formats dates in both languages", () => {
    expect(formatDate("2026-10-07", "am")).toBe("መስከረም 27, 2019");
    expect(formatDate("2026-10-07", "en")).toBe("Meskerem 27, 2019");
    expect(formatDate("2026-10-07", "am", { era: true })).toBe("መስከረም 27, 2019 ዓ.ም");
    expect(formatDate("2026-10-07", "en", { era: true })).toBe("Meskerem 27, 2019 E.C.");
    expect(formatShortDate("2026-10-07", "en")).toBe("Mes 27");
    expect(formatMonthYear({ year: 2019, month: 13 }, "am")).toBe("ጳጉሜን 2019");
  });

  it("formats ranges compactly within one Ethiopian year", () => {
    // Abebe's period: Oct 01 – Oct 30, 2026.
    expect(formatDateRange("2026-10-01", "2026-10-30", "am")).toBe("መስከረም 21 – ጥቅምት 20, 2019");
    expect(formatDateRange("2026-08-01", "2026-10-30", "en")).toBe("Hamle 25, 2018 – Tekemt 20, 2019");
    expect(formatDateRange("2026-09-11", "2026-10-07", "am")).toBe("መስከረም 1 – 27, 2019");
  });

  it("names weekdays", () => {
    expect(dayOfWeek("2026-10-07")).toBe(3);
    expect(formatWeekday("2026-10-07", "am")).toBe("ረቡዕ");
    expect(formatWeekday("2026-10-07", "en")).toBe("Wednesday");
  });

  it("shows Ethiopian time in Amharic and the 24-hour clock in English, at the gym", () => {
    // 11:20 UTC = 14:20 in Addis Ababa.
    expect(formatTime("2026-10-07T11:20:00Z", "am")).toBe("ከቀኑ 8:20");
    expect(formatTime("2026-10-07T11:20:00Z", "en")).toBe("14:20");
    expect(formatTime("2026-10-07T05:05:00Z", "am")).toBe("ከጠዋቱ 2:05");
    expect(formatTime("2026-10-07T16:00:00Z", "am")).toBe("ከምሽቱ 1:00");
    // 22:30 UTC is already the next day (01:30) in Addis Ababa.
    expect(formatTimestamp("2026-10-07T22:30:00Z", "am")).toBe("መስከረም 28, 2019 · ከሌሊቱ 7:30");
    expect(formatTimestamp("2026-10-07T22:30:00Z", "en")).toBe("Meskerem 28, 2019 · 01:30");
  });
});
