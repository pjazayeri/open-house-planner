import { describe, it, expect } from "vitest";
import type { Listing } from "../types";
import { relinkIds, relinkIdSet } from "./relinkIds";

function L(id: string, address: string, city = "San Francisco"): Listing {
  return {
    id, address, city,
    location: "",
    state: "CA", zip: "94115",
    price: 1_000_000, beds: 2, baths: 2, sqft: 1000, yearBuilt: 2010,
    daysOnMarket: 5, pricePerSqft: 1000, hoa: null, propertyType: "Condo/Co-op",
    openHouseStart: new Date(0), openHouseEnd: new Date(0),
    url: "", lat: 0, lng: 0, capRate: 0,
    capRateBreakdown: {} as Listing["capRateBreakdown"],
    status: "Active",
  };
}

describe("relinkIds (regression: priorities lost when Redfin re-lists with a new MLS#)", () => {
  it("passes through ids that still exist in current listings", () => {
    const r = relinkIds(["A", "B"], [L("A", "100 Main St"), L("B", "200 Oak Ave")], []);
    expect(r.ids).toEqual(["A", "B"]);
    expect(r.remappings).toEqual({});
  });

  it("relinks an orphaned id to the new MLS# via address+city match", () => {
    // Old id "OLD-123" was for "2727 Jackson", now relisted as "NEW-456".
    const current = [L("NEW-456", "2727 Jackson"), L("X", "Other")];
    const archived = [L("OLD-123", "2727 Jackson")];
    const r = relinkIds(["OLD-123", "X"], current, archived);
    expect(r.ids).toEqual(["NEW-456", "X"]);
    expect(r.remappings).toEqual({ "OLD-123": "NEW-456" });
  });

  it("preserves orphans that have no current address match (listing may come back)", () => {
    const archived = [L("OLD-Z", "999 Vanished Blvd")];
    const r = relinkIds(["OLD-Z"], [], archived);
    expect(r.ids).toEqual(["OLD-Z"]);
    expect(r.remappings).toEqual({});
  });

  it("preserves orphans with no archived snapshot at all (can't disambiguate)", () => {
    const r = relinkIds(["UNKNOWN"], [], []);
    expect(r.ids).toEqual(["UNKNOWN"]);
  });

  it("normalizes whitespace, casing, '#' vs 'Unit', street suffix abbreviations", () => {
    const current = [L("NEW", "100 Main Street #4B")];
    const archived = [L("OLD", "100  Main  St.  Unit 4B  ")];
    const r = relinkIds(["OLD"], current, archived);
    expect(r.ids).toEqual(["NEW"]);
    expect(r.remappings).toEqual({ "OLD": "NEW" });
  });

  it("dedupes when a relinked id collides with another id already in the list", () => {
    // Two old ids both map to the same new id (shouldn't normally happen, but
    // handle it cleanly anyway: keep one, drop the duplicate).
    const current = [L("NEW", "100 Main St")];
    const archived = [L("OLD-A", "100 Main St"), L("OLD-B", "100 Main St")];
    const r = relinkIds(["OLD-A", "OLD-B"], current, archived);
    expect(r.ids).toEqual(["NEW"]);
  });

  it("preserves the order of valid ids when relinking happens in the middle", () => {
    const current = [L("A", "addr-A"), L("NEW-B", "addr-B"), L("C", "addr-C")];
    const archived = [L("OLD-B", "addr-B")];
    const r = relinkIds(["A", "OLD-B", "C"], current, archived);
    expect(r.ids).toEqual(["A", "NEW-B", "C"]);
    expect(r.remappings).toEqual({ "OLD-B": "NEW-B" });
  });

  it("does NOT relink a city mismatch (same address string, different city)", () => {
    const current = [L("NEW", "100 Main St", "Oakland")];
    const archived = [L("OLD", "100 Main St", "San Francisco")];
    const r = relinkIds(["OLD"], current, archived);
    expect(r.ids).toEqual(["OLD"]); // preserved as orphan; not remapped to Oakland
    expect(r.remappings).toEqual({});
  });
});

describe("relinkIdSet (Set wrapper for hiddenIds)", () => {
  it("relinks Set entries via the same algorithm", () => {
    const current = [L("NEW", "X"), L("Y", "Y")];
    const archived = [L("OLD", "X")];
    const r = relinkIdSet(new Set(["OLD", "Y"]), current, archived);
    expect(Array.from(r.ids).sort()).toEqual(["NEW", "Y"]);
    expect(r.remappings).toEqual({ "OLD": "NEW" });
  });
});
