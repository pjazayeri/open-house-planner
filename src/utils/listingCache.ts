import type { Listing } from "../types";

const CACHE_KEY = "visited-listing-cache";

type StoredListing = Omit<Listing, "openHouseStart" | "openHouseEnd"> & {
  openHouseStart: string;
  openHouseEnd: string;
};

export function getCachedListings(): Record<string, Listing> {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, StoredListing>;
    const result: Record<string, Listing> = {};
    for (const [id, l] of Object.entries(raw)) {
      result[id] = { ...l, openHouseStart: new Date(l.openHouseStart), openHouseEnd: new Date(l.openHouseEnd) };
    }
    return result;
  } catch {
    return {};
  }
}

export function updateListingCache(listings: Listing[]): void {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    for (const l of listings) {
      raw[l.id] = { ...l, openHouseStart: l.openHouseStart.toISOString(), openHouseEnd: l.openHouseEnd.toISOString() };
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(raw));
  } catch { /* storage full or blocked */ }
}
