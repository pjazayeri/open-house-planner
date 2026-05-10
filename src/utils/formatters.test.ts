import { describe, it, expect } from "vitest";
import { parseRedfinDate, formatPrice, formatBedsBaths, parseNum, hasOpenHouse, formatTimeRange } from "./formatters";

describe("hasOpenHouse (regression: epoch-0 dates render as 'Wed, Dec 31 4:00 PM')", () => {
  it("returns true for real future dates", () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(hasOpenHouse(future)).toBe(true);
    expect(hasOpenHouse(future, new Date(future.getTime() + 7200_000))).toBe(true);
  });

  it("returns false for epoch-0 (the placeholder transformAll uses for missing open houses)", () => {
    expect(hasOpenHouse(new Date(0))).toBe(false);
    expect(hasOpenHouse(new Date(0), new Date(0))).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(hasOpenHouse(null)).toBe(false);
    expect(hasOpenHouse(undefined)).toBe(false);
  });

  it("returns false if either start or end is epoch-0", () => {
    const real = new Date(Date.now() + 86_400_000);
    expect(hasOpenHouse(real, new Date(0))).toBe(false);
    expect(hasOpenHouse(new Date(0), real)).toBe(false);
  });

  it("formatTimeRange returns empty string for epoch-0 dates", () => {
    expect(formatTimeRange(new Date(0), new Date(0))).toBe("");
  });
});

describe("parseRedfinDate", () => {
  it("parses a valid Redfin date string", () => {
    const d = parseRedfinDate("March-1-2026 12:00 PM");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(2); // 0-indexed
    expect(d!.getDate()).toBe(1);
  });

  it("returns null for empty string", () => {
    expect(parseRedfinDate("")).toBeNull();
    expect(parseRedfinDate("   ")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseRedfinDate("not-a-date")).toBeNull();
  });

  it("handles different months", () => {
    const d = parseRedfinDate("December-31-2025 11:00 AM");
    expect(d).not.toBeNull();
    expect(d!.getMonth()).toBe(11);
    expect(d!.getDate()).toBe(31);
  });
});

describe("formatPrice", () => {
  it("formats a round price with commas", () => {
    expect(formatPrice(1175000)).toBe("$1,175,000");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0");
  });

  it("formats a small price", () => {
    expect(formatPrice(500)).toBe("$500");
  });
});

describe("formatBedsBaths", () => {
  it("formats standard bed/bath count", () => {
    expect(formatBedsBaths(2, 2)).toBe("2 bd / 2 ba");
  });

  it("uses Studio for 0 beds", () => {
    expect(formatBedsBaths(0, 1)).toBe("Studio / 1 ba");
  });

  it("formats fractional baths", () => {
    expect(formatBedsBaths(3, 2.5)).toBe("3 bd / 2.5 ba");
  });
});

describe("parseNum", () => {
  it("parses a valid number string", () => {
    expect(parseNum("1234")).toBe(1234);
  });

  it("returns null for empty string", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("   ")).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parseNum("abc")).toBeNull();
  });

  it("parses zero", () => {
    expect(parseNum("0")).toBe(0);
  });

  it("parses decimals", () => {
    expect(parseNum("3.14")).toBe(3.14);
  });
});
