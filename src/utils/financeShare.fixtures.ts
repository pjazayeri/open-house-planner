// Shared test fixtures for the finance share snapshot (not a test file itself).
import type { Listing } from "../types";
import { computeCapRateBreakdown } from "./capRate";
import type { FinanceInputs } from "./financeShare";

export function makeListing(over: Partial<Listing> = {}): Listing {
  const input = {
    price: 1_350_000, beds: 2, baths: 2, sqft: 1500, yearBuilt: 2005, hoa: 2122,
    city: "San Francisco", zip: "94109", propertyType: "Condo/Co-op",
  };
  const b = computeCapRateBreakdown(input);
  return {
    id: "425001",
    address: "1835 Franklin St #802",
    location: "Pacific Heights",
    city: input.city,
    state: "CA",
    zip: input.zip,
    price: input.price,
    beds: input.beds,
    baths: input.baths,
    sqft: input.sqft,
    yearBuilt: input.yearBuilt,
    daysOnMarket: 12,
    pricePerSqft: 900,
    hoa: input.hoa,
    propertyType: input.propertyType,
    openHouseStart: new Date("2026-11-22T21:00:00Z"),
    openHouseEnd: new Date("2026-11-22T23:00:00Z"),
    url: "https://www.redfin.com/CA/San-Francisco/home/1",
    lat: 37.79,
    lng: -122.425,
    capRate: b.capRate,
    capRateBreakdown: b,
    status: "Active",
    ...over,
  };
}

export const INPUTS: FinanceInputs = {
  downPct: 100, ratePct: 7.11, termYears: 30, oppReturnPct: 4, taxRatePct: 32,
  appreciationPct: 3, includeAppreciation: true, saltHeadroomK: 10, includePrincipal: true,
  holdYears: 28, buyerClosingPct: 0.25, sellerCostPct: 6, rentInflationPct: 3,
};
