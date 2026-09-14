import { describe, it, expect } from "vitest";
import { overlayCatalogRows } from "./overlayOpenHouses";
import { addressKey } from "./addressKey";
import type { RawListing } from "../types";

const row = (over: Partial<RawListing>): RawListing =>
  ({ ADDRESS: "1 Main St", CITY: "San Francisco", STATUS: "Active", PRICE: "1000000", FAVORITE: "Y",
     "MLS#": "123", BEDS: "2", "NEXT OPEN HOUSE START TIME": "September-13-2026 01:00 PM", "NEXT OPEN HOUSE END TIME": "September-13-2026 03:00 PM", ...over }) as RawListing;
const key = addressKey("1 Main St", "San Francisco");

describe("overlayCatalogRows", () => {
  it("refreshes status, price and open-house times; keeps identity fields", () => {
    const fresh = { [key]: { STATUS: "Pending", PRICE: "950000", "NEXT OPEN HOUSE START TIME": "September-20-2026 01:00 PM", "NEXT OPEN HOUSE END TIME": "September-20-2026 03:00 PM", "MLS#": "999", FAVORITE: "N" } };
    const { rows, changes } = overlayCatalogRows([row({})], fresh);
    expect(rows[0].STATUS).toBe("Pending");
    expect(rows[0].PRICE).toBe("950000");
    expect(rows[0]["NEXT OPEN HOUSE START TIME"]).toBe("September-20-2026 01:00 PM");
    expect(rows[0]["MLS#"]).toBe("123");
    expect(rows[0].FAVORITE).toBe("Y");
    expect(changes).toEqual({ matched: 1, status: 1, price: 1, openHouse: 1 });
  });

  it("clears stale open-house times when the catalog has none upcoming", () => {
    const { rows, changes } = overlayCatalogRows([row({})], { [key]: { "NEXT OPEN HOUSE START TIME": "", "NEXT OPEN HOUSE END TIME": "" } });
    expect(rows[0]["NEXT OPEN HOUSE START TIME"]).toBe("");
    expect(changes.openHouse).toBe(1);
  });

  it("leaves unmatched rows untouched and counts nothing", () => {
    const original = row({ ADDRESS: "2 Oak Ave" });
    const { rows, changes } = overlayCatalogRows([original], { [key]: { STATUS: "Sold" } });
    expect(rows[0]).toBe(original);
    expect(changes).toEqual({ matched: 0, status: 0, price: 0, openHouse: 0 });
  });

  it("does not count unchanged values", () => {
    const { changes } = overlayCatalogRows([row({})], { [key]: { STATUS: "Active", PRICE: "1000000" } });
    expect(changes).toEqual({ matched: 1, status: 0, price: 0, openHouse: 0 });
  });
});
