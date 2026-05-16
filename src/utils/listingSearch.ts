import type { Listing } from "../types";

/**
 * Returns true iff every whitespace-separated token in `query` is found
 * (case-insensitive substring) somewhere in the listing's searchable text:
 * address, city, location/neighborhood, zip, MLS #.
 *
 * Multi-token AND lets users narrow without needing exact field selectors:
 *   "laguna"        → every listing on Laguna St (too broad)
 *   "2121 laguna"   → only the listing whose address has both "2121" and "laguna"
 *   "laguna 94115"  → Laguna-anything in zip 94115
 *
 * Single-substring matching (what we used before) couldn't do that — typing
 * "2121 laguna" failed because no field contains the literal substring
 * "2121 laguna" with that exact whitespace.
 */
export function matchesListingSearch(listing: Listing, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    listing.address,
    listing.city,
    listing.location,
    listing.zip ?? "",
    listing.id,
  ]
    .join(" ")
    .toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}
