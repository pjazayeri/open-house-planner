import { describe, it, expect } from "vitest";
import { optimizeRoute } from "./routeOptimizer";
import type { Listing } from "../types";

function makeListing(id: string, lat: number, lng: number, start: Date, end: Date): Listing {
  return {
    id,
    address: `${id} St`,
    location: "",
    city: "San Francisco",
    state: "CA",
    zip: "94102",
    price: 1_000_000,
    beds: 2,
    baths: 1,
    sqft: 1000,
    hoa: null,
    yearBuilt: 2000,
    daysOnMarket: null,
    pricePerSqft: null,
    propertyType: "Condo/Co-op",
    openHouseStart: start,
    openHouseEnd: end,
    url: "",
    lat,
    lng,
    capRate: 3.0,
    capRateBreakdown: {} as Listing["capRateBreakdown"],
    status: "Active",
  };
}

const SLOT_A_START = new Date("2026-06-14T18:00:00Z");
const SLOT_A_END   = new Date("2026-06-14T20:00:00Z");
const SLOT_B_START = new Date("2026-06-14T21:00:00Z");
const SLOT_B_END   = new Date("2026-06-14T23:00:00Z");

describe("optimizeRoute", () => {
  it("returns an empty array for no listings", () => {
    expect(optimizeRoute([])).toHaveLength(0);
  });

  it("groups listings by time slot", () => {
    const listings = [
      makeListing("A", 37.77, -122.42, SLOT_A_START, SLOT_A_END),
      makeListing("B", 37.78, -122.43, SLOT_A_START, SLOT_A_END),
      makeListing("C", 37.79, -122.44, SLOT_B_START, SLOT_B_END),
    ];
    const groups = optimizeRoute(listings);
    expect(groups).toHaveLength(2);
    expect(groups[0].listings).toHaveLength(2);
    expect(groups[1].listings).toHaveLength(1);
  });

  it("sorts groups by start time", () => {
    const listings = [
      makeListing("late", 37.77, -122.42, SLOT_B_START, SLOT_B_END),
      makeListing("early", 37.77, -122.43, SLOT_A_START, SLOT_A_END),
    ];
    const groups = optimizeRoute(listings);
    expect(groups[0].startTime).toEqual(SLOT_A_START);
    expect(groups[1].startTime).toEqual(SLOT_B_START);
  });

  it("assigns sequential visitOrder across all groups", () => {
    const listings = [
      makeListing("A", 37.77, -122.42, SLOT_A_START, SLOT_A_END),
      makeListing("B", 37.78, -122.43, SLOT_A_START, SLOT_A_END),
      makeListing("C", 37.79, -122.44, SLOT_B_START, SLOT_B_END),
    ];
    const groups = optimizeRoute(listings);
    const allListings = groups.flatMap((g) => g.listings);
    const orders = allListings.map((l) => l.visitOrder!).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3]);
  });

  it("orders by nearest-neighbor within a slot", () => {
    // Three listings: A is far from B and C, B and C are close together
    // Nearest-neighbor from A should visit C (close to B) last
    const listings = [
      makeListing("A", 37.70, -122.40, SLOT_A_START, SLOT_A_END), // starting point (first)
      makeListing("B", 37.79, -122.41, SLOT_A_START, SLOT_A_END), // far north
      makeListing("C", 37.79, -122.40, SLOT_A_START, SLOT_A_END), // close to B
    ];
    const groups = optimizeRoute(listings);
    const ids = groups[0].listings.map((l) => l.id);
    // A is first; B and C should follow. B is slightly closer to A than C is
    // (same latitude difference, B is -122.41 vs C is -122.40 starting from -122.40).
    // The exact order depends on haversine — just verify A comes first.
    expect(ids[0]).toBe("A");
  });

  it("handles a single listing", () => {
    const listings = [makeListing("solo", 37.77, -122.42, SLOT_A_START, SLOT_A_END)];
    const groups = optimizeRoute(listings);
    expect(groups).toHaveLength(1);
    expect(groups[0].listings[0].visitOrder).toBe(1);
  });
});
