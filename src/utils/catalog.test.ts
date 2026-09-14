import { describe, it, expect } from "vitest";
import { catalogEntriesToRows, type CatalogEntry } from "./catalog";
import type { RawListing } from "../types";

const row = (over: Partial<RawListing>): RawListing =>
  ({ ADDRESS: "1 Main St", CITY: "San Francisco", STATUS: "Active", FAVORITE: "Y", ...over }) as RawListing;

const entries: CatalogEntry[] = [
  { addressKey: "1 main st|san francisco", row: row({ "NEXT OPEN HOUSE START TIME": "September-20-2026 01:00 PM" }) },
  { addressKey: "2 oak ave|san francisco", row: row({ ADDRESS: "2 Oak Ave" }) },
  { addressKey: "1 main st|san francisco", row: row({ ADDRESS: "1 Main St (dup)" }) },
];

describe("catalogEntriesToRows", () => {
  it("returns pipeline-ready rows, deduped by address key, flagged as non-favorites", () => {
    const rows = catalogEntriesToRows(entries);
    expect(rows.map((r) => r.ADDRESS)).toEqual(["1 Main St", "2 Oak Ave"]);
    expect(rows.every((r) => r.FAVORITE === "N")).toBe(true);
    expect(rows[0]["NEXT OPEN HOUSE START TIME"]).toBe("September-20-2026 01:00 PM");
  });

  it("drops entries the user already has", () => {
    const rows = catalogEntriesToRows(entries, ["1 main st|san francisco"]);
    expect(rows.map((r) => r.ADDRESS)).toEqual(["2 Oak Ave"]);
  });

  it("handles missing or empty input", () => {
    expect(catalogEntriesToRows(undefined)).toEqual([]);
    expect(catalogEntriesToRows([])).toEqual([]);
  });
});
