import { describe, expect, it } from "vitest";
import { addDays, dateInTimeZone, daysBetween, isDateOnly } from "./dates";
import {
  averageMoney,
  formatMoney,
  fromCents,
  parsePriceInput,
  sumMoney,
  toCents,
} from "./money";
import {
  formatPhone,
  normalizeEthiopianPhone,
  phoneSearchDigits,
} from "./phone";

describe("dates", () => {
  it("does whole-day arithmetic", () => {
    expect(addDays("2026-10-30", 1)).toBe("2026-10-31");
    expect(daysBetween("2026-10-07", "2026-10-30")).toBe(23);
  });
  it("validates date-only strings", () => {
    expect(isDateOnly("2026-02-29")).toBe(false);
    expect(isDateOnly("2028-02-29")).toBe(true);
    expect(isDateOnly("2026-10-7")).toBe(false);
  });
  it("uses the Addis Ababa calendar date, not the server's UTC date", () => {
    // 22:30 UTC on Oct 07 is already 01:30 on Oct 08 in Addis Ababa (UTC+3).
    expect(dateInTimeZone(new Date("2026-10-07T22:30:00Z"))).toBe("2026-10-08");
    expect(dateInTimeZone(new Date("2026-10-07T20:59:00Z"))).toBe("2026-10-07");
  });
});

describe("money", () => {
  it("formats ETB as '1,500.00 ETB'", () => {
    expect(formatMoney("1500.00")).toBe("1,500.00 ETB");
    expect(formatMoney("125000")).toBe("125,000.00 ETB");
  });
  it("sums without floating-point drift", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30");
    expect(sumMoney(["1500.00", "4000.00", "150.00"])).toBe("5650.00");
  });
  it("round-trips cents", () => {
    expect(fromCents(toCents("14000.5"))).toBe("14000.50");
  });
  it("averages to zero when there are no transactions", () => {
    expect(averageMoney("0.00", 0)).toBe("0.00");
    expect(averageMoney("100.00", 3)).toBe("33.33");
  });
  it("validates plan prices: positive with at most two decimals", () => {
    expect(parsePriceInput("1,200.00")).toBe("1200.00");
    expect(parsePriceInput("1200.5")).toBe("1200.50");
    expect(parsePriceInput("0")).toBeNull();
    expect(parsePriceInput("12.345")).toBeNull();
    expect(parsePriceInput("-5")).toBeNull();
  });
});

describe("phone", () => {
  it("normalizes local and international forms to +251", () => {
    for (const input of [
      "0911 234 567",
      "0911234567",
      "+251 911 234 567",
      "251911234567",
      "911234567",
      "0911-234-567",
    ]) {
      expect(normalizeEthiopianPhone(input)).toBe("+251911234567");
    }
  });
  it("accepts Safaricom 07 numbers", () => {
    expect(normalizeEthiopianPhone("0712 345 678")).toBe("+251712345678");
  });
  it("rejects invalid or landline numbers for members", () => {
    expect(normalizeEthiopianPhone("0221118920")).toBeNull();
    expect(normalizeEthiopianPhone("09112")).toBeNull();
    expect(normalizeEthiopianPhone("abc")).toBeNull();
  });
  it("accepts landlines when any number is allowed", () => {
    expect(normalizeEthiopianPhone("022 111 8920", "any")).toBe(
      "+251221118920",
    );
  });
  it("formats canonical numbers for display", () => {
    expect(formatPhone("+251911234567")).toBe("0911 234 567");
    expect(formatPhone("+251221118920")).toBe("022 111 8920");
  });
  it("extracts comparable digits from phone-like search queries", () => {
    expect(phoneSearchDigits("0911 234")).toBe("911234");
    expect(phoneSearchDigits("+251911")).toBe("911");
    expect(phoneSearchDigits("Abebe")).toBeNull();
  });
});
