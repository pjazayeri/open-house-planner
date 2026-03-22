import type { RawListing, Listing } from "../types";
import { parseRedfinDate, parseNum } from "./formatters";
import { computeCapRateBreakdown } from "./capRate";

const URL_COLUMN =
  "URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)";

// Override SF MLS district codes with real neighborhood names.
// Fill in the correct mapping for your listings — leave blank to show the raw district label.
export const SF_DISTRICT_MAP: Record<string, string> = {
  // "SF District 1": "Richmond",
  // "SF District 2": "...",
  // etc.
};

function normalizeLocation(location: string, city: string): string {
  if (city === "San Francisco" && location in SF_DISTRICT_MAP) {
    return SF_DISTRICT_MAP[location];
  }
  return location;
}

/**
 * Filter raw CSV rows to active listings with open houses starting today
 * or in the future, and transform them into our Listing type.
 */
export function filterAndTransform(rows: RawListing[]): Listing[] {
  const listings: Listing[] = [];

  for (const row of rows) {
    if (row.STATUS !== "Active") continue;

    const startTime = parseRedfinDate(row["NEXT OPEN HOUSE START TIME"]);
    const endTime = parseRedfinDate(row["NEXT OPEN HOUSE END TIME"]);
    if (!startTime || !endTime) continue;

    const lat = parseFloat(row.LATITUDE);
    const lng = parseFloat(row.LONGITUDE);
    if (isNaN(lat) || isNaN(lng)) continue;

    const price = Number(row.PRICE) || 0;
    const beds = Number(row.BEDS) || 0;
    const baths = Number(row.BATHS) || 0;
    const sqft = parseNum(row["SQUARE FEET"]);
    const yearBuilt = parseNum(row["YEAR BUILT"]);
    const hoa = parseNum(row["HOA/MONTH"]);
    const zip = row["ZIP OR POSTAL CODE"];
    const propertyType = row["PROPERTY TYPE"];
    const breakdown = computeCapRateBreakdown({ price, beds, baths, sqft, yearBuilt, hoa, city: row.CITY, zip, propertyType });

    listings.push({
      id: row["MLS#"] || `${row.ADDRESS}-${row.CITY}`,
      address: row.ADDRESS,
      location: normalizeLocation(row.LOCATION || "", row.CITY),
      city: row.CITY,
      state: row["STATE OR PROVINCE"],
      zip,
      price,
      beds,
      baths,
      sqft,
      yearBuilt,
      daysOnMarket: parseNum(row["DAYS ON MARKET"]),
      pricePerSqft: parseNum(row["$/SQUARE FEET"]),
      hoa,
      propertyType,
      openHouseStart: startTime,
      openHouseEnd: endTime,
      url: row[URL_COLUMN],
      lat,
      lng,
      capRate: breakdown.capRate,
      capRateBreakdown: breakdown,
    });
  }

  return listings;
}

const SKIP_NEIGHBORHOODS = new Set([
  "", "not applicable", "not defined", "other", "699 - not defined",
  "san francisco", // too broad — only used when there's no real neighborhood
]);

/**
 * Get distinct neighborhoods from listings, filtered to meaningful values.
 */
export function getNeighborhoods(listings: Listing[]): string[] {
  const seen = new Set<string>();
  for (const l of listings) {
    const n = l.location.trim();
    if (n && !SKIP_NEIGHBORHOODS.has(n.toLowerCase())) seen.add(n);
  }
  return Array.from(seen).sort();
}

/**
 * Get distinct cities from listings.
 */
export function getCities(listings: Listing[]): string[] {
  const cities = new Set(listings.map((l) => l.city));
  const sorted = Array.from(cities).sort();
  // Put San Francisco first if present
  if (sorted.includes("San Francisco")) {
    return [
      "San Francisco",
      ...sorted.filter((c) => c !== "San Francisco"),
    ];
  }
  return sorted;
}
