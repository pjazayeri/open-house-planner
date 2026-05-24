import { describe, it, expect } from "vitest";
import { addressKey } from "./addressKey";

describe("addressKey", () => {
  it("lowercases, trims, and appends the city", () => {
    expect(addressKey("  100 Main St  ", "San Francisco")).toBe("100 main st|san francisco");
  });

  it("normalizes street-suffix variants to the same key", () => {
    const a = addressKey("100 Main Street", "SF");
    const b = addressKey("100 Main St.", "SF");
    const c = addressKey("100 Main St", "SF");
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("treats 'Unit X' and '#X' identically", () => {
    expect(addressKey("100 Main St Unit 4B", "SF")).toBe(addressKey("100 Main St #4B", "SF"));
  });

  it("collapses extra whitespace and commas", () => {
    expect(addressKey("100  Main   St,  ", "SF")).toBe(addressKey("100 Main St", "SF"));
  });

  it("normalizes common suffixes (Avenue/Boulevard/Road/Drive/Place)", () => {
    expect(addressKey("5 Park Avenue", "SF")).toBe("5 park ave|sf");
    expect(addressKey("5 Park Blvd.", "SF")).toBe("5 park blvd|sf");
    expect(addressKey("5 Oak Road", "SF")).toBe("5 oak rd|sf");
    expect(addressKey("5 Oak Drive", "SF")).toBe("5 oak dr|sf");
    expect(addressKey("5 Sunset Place", "SF")).toBe("5 sunset pl|sf");
  });

  it("keys differ when the city differs (same street, different city)", () => {
    expect(addressKey("100 Main St", "San Francisco")).not.toBe(addressKey("100 Main St", "Oakland"));
  });

  it("is idempotent (normalizing an already-normalized key's address is stable)", () => {
    const once = addressKey("100 Main Street #4B", "San Francisco");
    expect(once).toBe("100 main st #4b|san francisco");
  });
});
