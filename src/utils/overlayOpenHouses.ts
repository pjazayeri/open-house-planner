import type { RawListing } from "../types";
import { addressKey } from "./addressKey";

export interface CatalogOpenHouse {
  start: string;
  end: string | null;
  mlsId: string | null;
}

/**
 * Overlay fresh open-house times from the shared catalog onto raw CSV rows,
 * matched by normalized address.
 *
 * The uploaded Redfin CSV defines WHICH homes are the user's favorites (and
 * carries their price/beds/etc.); the catalog — refreshed daily by the cron —
 * provides the CURRENT open-house time. Overlaying here means the user no
 * longer has to re-export the CSV each weekend just to get fresh times.
 *
 * Returns a new array (rows are shallow-copied only when a match overrides
 * their time); rows with no catalog match keep their CSV times unchanged (a
 * stale/past time simply gets filtered out downstream by `openHouseEnd > now`).
 */
export function overlayOpenHouses(
  rows: RawListing[],
  catalog: Record<string, CatalogOpenHouse>,
): { rows: RawListing[]; matched: number } {
  let matched = 0;
  const out = rows.map((row) => {
    const fresh = catalog[addressKey(row.ADDRESS ?? "", row.CITY ?? "")];
    if (!fresh) return row;
    matched++;
    return {
      ...row,
      "NEXT OPEN HOUSE START TIME": fresh.start,
      "NEXT OPEN HOUSE END TIME": fresh.end ?? "",
    };
  });
  return { rows: out, matched };
}
