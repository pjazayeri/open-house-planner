import type { RawListing } from "../types";

/**
 * Shape of `GET /api/listings?catalog=1` → `catalog`. Each entry is a full
 * Redfin-CSV-shaped row for a listing with an upcoming open house (times
 * already refreshed from the catalog), keyed by the normalized address.
 */
export interface CatalogEntry {
  addressKey: string;
  row: RawListing;
}

export interface CatalogResponse {
  openHouses: Record<string, { start: string; end: string | null; mlsId: string | null }>;
  count: number;
  catalog?: CatalogEntry[];
}

/**
 * Turn catalog entries into rows the normal CSV pipeline accepts
 * (parse → filterListings → capRate). Entries the user already has (by
 * address key) are dropped so a catalog browse never duplicates a favorite.
 */
export function catalogEntriesToRows(
  entries: CatalogEntry[] | undefined,
  excludeAddressKeys: Iterable<string> = []
): RawListing[] {
  if (!entries?.length) return [];
  const skip = new Set(excludeAddressKeys);
  const seen = new Set<string>();
  const out: RawListing[] = [];
  for (const e of entries) {
    if (!e?.addressKey || !e.row || skip.has(e.addressKey) || seen.has(e.addressKey)) continue;
    seen.add(e.addressKey);
    // Catalog rows are not the user's favorites — make that explicit so
    // anything keyed off Redfin's FAVORITE flag treats them as "browse only".
    out.push({ ...e.row, FAVORITE: "N" });
  }
  return out;
}
