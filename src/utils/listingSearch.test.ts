import { describe, it, expect } from "vitest";
import type { Listing } from "../types";
import { matchesListingSearch } from "./listingSearch";

function listing(over: Partial<Listing> & {
  address?: string;
  city?: string;
  location?: string;
  zip?: string;
  id?: string;
} = {}): Listing {
  return {
    id: over.id ?? "426000001",
    address: over.address ?? "2121 Laguna St #25",
    location: over.location ?? "Pacific Heights",
    city: over.city ?? "San Francisco",
    state: "CA",
    zip: over.zip ?? "94115",
    price: 899_000,
    beds: 1,
    baths: 1,
    sqft: 800,
    yearBuilt: 2010,
    daysOnMarket: 10,
    pricePerSqft: 1124,
    hoa: null,
    propertyType: "Condo/Co-op",
    openHouseStart: new Date(0),
    openHouseEnd: new Date(0),
    url: "",
    lat: 37.79,
    lng: -122.43,
    capRate: 2.03,
    capRateBreakdown: {} as Listing["capRateBreakdown"],
    status: "Active",
    ...over,
  };
}

describe("matchesListingSearch — empty/whitespace queries", () => {
  it("returns true on empty string", () => {
    expect(matchesListingSearch(listing(), "")).toBe(true);
  });
  it("returns true on whitespace-only string", () => {
    expect(matchesListingSearch(listing(), "   ")).toBe(true);
  });
  it("trims surrounding whitespace before matching", () => {
    expect(matchesListingSearch(listing(), "  laguna  ")).toBe(true);
  });
});

describe("matchesListingSearch — single-token substring", () => {
  it("matches address substring (case-insensitive)", () => {
    expect(matchesListingSearch(listing({ address: "2121 Laguna St #25" }), "laguna")).toBe(true);
    expect(matchesListingSearch(listing({ address: "2121 Laguna St #25" }), "LAGUNA")).toBe(true);
  });
  it("matches city", () => {
    expect(matchesListingSearch(listing({ city: "Oakland" }), "oak")).toBe(true);
  });
  it("matches neighborhood (location)", () => {
    expect(matchesListingSearch(listing({ location: "Pacific Heights" }), "pacific")).toBe(true);
  });
  it("matches zip code", () => {
    expect(matchesListingSearch(listing({ zip: "94115" }), "94115")).toBe(true);
    expect(matchesListingSearch(listing({ zip: "94115" }), "9411")).toBe(true);
  });
  it("matches MLS # / listing id", () => {
    expect(matchesListingSearch(listing({ id: "426125979" }), "426125979")).toBe(true);
    expect(matchesListingSearch(listing({ id: "426125979" }), "12597")).toBe(true);
  });
  it("does NOT match a token not present in any field", () => {
    expect(matchesListingSearch(listing({ address: "100 Pine St" }), "laguna")).toBe(false);
  });
});

describe("matchesListingSearch — multi-token AND (regression: 'laguna' matched too much)", () => {
  // The point of this rewrite: a user typing "2121 laguna" should ONLY get
  // listings that contain BOTH tokens — narrowing down from every Laguna St
  // address to just the one unit. Old single-substring match couldn't do
  // that because no field contained the literal "2121 laguna" together.
  it("requires every space-separated token to match somewhere", () => {
    const target = listing({ address: "2121 Laguna St #25" });
    const sibling = listing({ address: "2050 Laguna St #401" });
    const distant = listing({ address: "100 Pine St" });

    // "laguna" alone: matches both Laguna addresses — that's the old problem.
    expect(matchesListingSearch(target, "laguna")).toBe(true);
    expect(matchesListingSearch(sibling, "laguna")).toBe(true);

    // "2121 laguna": now narrows to only the 2121 listing.
    expect(matchesListingSearch(target, "2121 laguna")).toBe(true);
    expect(matchesListingSearch(sibling, "2121 laguna")).toBe(false);
    expect(matchesListingSearch(distant, "2121 laguna")).toBe(false);
  });

  it("tokens can match across different fields (address + zip)", () => {
    const a = listing({ address: "100 Fell St", zip: "94117" });
    const b = listing({ address: "100 Fell St", zip: "94115" });
    expect(matchesListingSearch(a, "fell 94117")).toBe(true);
    expect(matchesListingSearch(b, "fell 94117")).toBe(false);
  });

  it("token order does not matter", () => {
    const target = listing({ address: "2121 Laguna St #25" });
    expect(matchesListingSearch(target, "2121 laguna")).toBe(true);
    expect(matchesListingSearch(target, "laguna 2121")).toBe(true);
  });

  it("collapses repeated whitespace between tokens", () => {
    const target = listing({ address: "2121 Laguna St #25" });
    expect(matchesListingSearch(target, "2121     laguna")).toBe(true);
  });

  it("returns false when any one token has no match", () => {
    const target = listing({ address: "2121 Laguna St #25", city: "San Francisco" });
    expect(matchesListingSearch(target, "laguna oakland")).toBe(false);
  });
});

describe("matchesListingSearch — punctuation in addresses", () => {
  it("# in address is matched literally", () => {
    expect(matchesListingSearch(listing({ address: "2121 Laguna St #25" }), "#25")).toBe(true);
  });
  it("matches a unit suffix on its own", () => {
    expect(matchesListingSearch(listing({ address: "2121 Laguna St #25" }), "25")).toBe(true);
  });
});
