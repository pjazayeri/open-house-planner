import type { RawListing, Listing } from "../types";
import { parseRedfinDate, parseNum } from "./formatters";
import { computeCapRateBreakdown } from "./capRate";

const URL_COLUMN =
  "URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)";

/** Dates for "this weekend": Saturday Mar 7 and Sunday Mar 8, 2026 */
function isThisWeekend(date: Date): boolean {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed: Mar=2
  const d = date.getDate();
  return (
    (y === 2026 && m === 2 && d === 7) || // Mar 7
    (y === 2026 && m === 2 && d === 8)    // Mar 8
  );
}

/**
 * Filter raw CSV rows to active listings with open houses this weekend,
 * and transform them into our Listing type.
 */
export function filterAndTransform(rows: RawListing[]): Listing[] {
  const listings: Listing[] = [];

  for (const row of rows) {
    if (row.STATUS !== "Active") continue;

    const startTime = parseRedfinDate(row["NEXT OPEN HOUSE START TIME"]);
    const endTime = parseRedfinDate(row["NEXT OPEN HOUSE END TIME"]);
    if (!startTime || !endTime) continue;
    if (!isThisWeekend(startTime)) continue;

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
