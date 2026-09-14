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

/** Fields the catalog is allowed to overwrite on a user's CSV row. */
const REFRESHABLE_FIELDS = [
  "NEXT OPEN HOUSE START TIME",
  "NEXT OPEN HOUSE END TIME",
  "STATUS",
  "PRICE",
  "DAYS ON MARKET",
  "$/SQUARE FEET",
  "HOA/MONTH",
  "SOLD DATE",
] as const satisfies readonly (keyof RawListing)[];

export interface OverlayChanges {
  matched: number;
  status: number;
  price: number;
  openHouse: number;
}

/**
 * Overlay fresh catalog rows (from `POST /api/listings`) onto the user's CSV
 * rows, matched by normalized address. Unlike `overlayOpenHouses`, this
 * refreshes status/price/DOM too and CLEARS stale open-house times when the
 * catalog has no upcoming open house for the address. Identity fields
 * (address, MLS#, FAVORITE, beds/baths/sqft…) always come from the user's row.
 */
export function overlayCatalogRows(
  rows: RawListing[],
  fresh: Record<string, Partial<RawListing>>,
): { rows: RawListing[]; changes: OverlayChanges } {
  const changes: OverlayChanges = { matched: 0, status: 0, price: 0, openHouse: 0 };
  const out = rows.map((row) => {
    const f = fresh[addressKey(row.ADDRESS ?? "", row.CITY ?? "")];
    if (!f) return row;
    changes.matched++;
    const next: RawListing = { ...row };
    for (const k of REFRESHABLE_FIELDS) {
      const v = f[k];
      if (v === undefined) continue;
      if ((next[k] ?? "") !== v) {
        if (k === "STATUS") changes.status++;
        else if (k === "PRICE") changes.price++;
        else if (k === "NEXT OPEN HOUSE START TIME") changes.openHouse++;
        next[k] = v;
      }
    }
    return next;
  });
  return { rows: out, changes };
}
