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

// ── Refresh ────────────────────────────────────────────────────────────

import type { OverlayChanges } from "./overlayOpenHouses";

/** `POST /api/listings` response. */
export interface CatalogRowsResponse {
  updatedAt: string | null;
  refreshed: boolean;
  refreshNote?: string;
  rows: Record<string, RawListing>;
  matched: number;
}

export interface RefreshResult {
  /** True when a fresh Redfin pull actually ran (false = catalog was recent). */
  refreshed: boolean;
  updatedAt: Date | null;
  changes: OverlayChanges;
  note?: string;
}

/** "just now", "4 min ago", "3h ago", "2d ago" — for the header freshness label. */
export function timeAgo(date: Date | null, now: Date = new Date()): string {
  if (!date) return "";
  const s = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** One-line summary for the refresh toast. */
export function describeRefresh(r: RefreshResult): string {
  const parts: string[] = [];
  if (r.changes.status) parts.push(`${r.changes.status} status change${r.changes.status === 1 ? "" : "s"}`);
  if (r.changes.price) parts.push(`${r.changes.price} price change${r.changes.price === 1 ? "" : "s"}`);
  if (r.changes.openHouse) parts.push(`${r.changes.openHouse} open-house update${r.changes.openHouse === 1 ? "" : "s"}`);
  if (parts.length === 0) {
    return r.refreshed ? "Listings refreshed — nothing changed" : `Already up to date (Redfin pulled ${timeAgo(r.updatedAt) || "recently"})`;
  }
  return `${r.refreshed ? "Refreshed" : "Updated"}: ${parts.join(", ")}`;
}

// ── Address keys for Listing objects ──────────────────────────────────

import type { Listing } from "../types";
import { addressKey } from "./addressKey";

/** Normalized address key of a transformed listing (matches catalog keys). */
export function listingAddressKey(l: Pick<Listing, "address" | "city">): string {
  return addressKey(l.address ?? "", l.city ?? "");
}

// ── Listing universe = CSV favorites ∪ hearted catalog listings ───────

/**
 * Build the rows the pipeline should run on: the user's (catalog-merged) CSV
 * rows plus a catalog row for every hearted address that the CSV doesn't
 * already contain. `missing` lists hearted addresses we have no catalog row
 * for yet (caller fetches them via POST /api/listings and recomposes).
 */
export function composeUniverse(
  csvRows: RawListing[],
  favoriteIds: Iterable<string>,
  catalogRows: Record<string, RawListing | undefined>,
): { rows: RawListing[]; added: number; missing: string[] } {
  const have = new Set(csvRows.map((r) => addressKey(r.ADDRESS ?? "", r.CITY ?? "")));
  const extras: RawListing[] = [];
  const missing: string[] = [];
  for (const key of favoriteIds) {
    if (have.has(key)) continue;
    const row = catalogRows[key];
    if (row) {
      extras.push({ ...row, FAVORITE: "Y" });
      have.add(key);
    } else {
      missing.push(key);
    }
  }
  return { rows: [...csvRows, ...extras], added: extras.length, missing };
}
