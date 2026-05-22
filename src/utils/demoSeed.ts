import type { Listing } from "../types";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Demo mode loads a fixed CSV bundled in `public/demo-listings.csv`. The CSV
 * has historical open-house timestamps, so without intervention the Planner
 * would be empty (it filters to `openHouseEnd > now`). This helper rolls
 * every listing's open-house window forward by whole weeks until at least
 * the earliest listing is in the future. Relative spacing across listings
 * is preserved (e.g. a Saturday open house stays on Saturday).
 *
 * Listings without a real open house (epoch-zero) are left alone so the
 * `hasOpenHouse` check still hides them in Browse/Planner.
 */
export function shiftListingsToFuture(listings: Listing[], now: Date = new Date()): Listing[] {
  if (listings.length === 0) return listings;

  let earliest = Infinity;
  for (const l of listings) {
    const t = l.openHouseStart.getTime();
    if (t > 0 && t < earliest) earliest = t;
  }
  if (!isFinite(earliest) || earliest > now.getTime()) return listings;

  const weeksNeeded = Math.ceil((now.getTime() - earliest) / MS_PER_WEEK);
  const offsetMs = weeksNeeded * MS_PER_WEEK;

  return listings.map((l) => {
    const startT = l.openHouseStart.getTime();
    const endT = l.openHouseEnd.getTime();
    if (startT <= 0 && endT <= 0) return l;
    return {
      ...l,
      openHouseStart: new Date(startT + offsetMs),
      openHouseEnd: new Date(endT + offsetMs),
    };
  });
}
