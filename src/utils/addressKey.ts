/**
 * Canonical address normalizer — the shared key for matching a listing across
 * MLS# changes, CSV re-uploads, and data sources (Redfin gis-csv, favorites
 * export, the Neon listings catalog).
 *
 * Used by both the client (relinkIds, favorite matching) and the server (cron
 * ingester upserts). Keep this dependency-free so it imports cleanly in api/.
 *
 * Aggressive normalization so trailing whitespace, casing, #/Unit spacing,
 * "Street" vs "St.", and trailing periods don't block a match between two
 * representations of the same address.
 */

// Street-type normalization so "100 Main Street" and "100 Main St." resolve to
// the same key.
const STREET_SUFFIX_MAP: Array<[RegExp, string]> = [
  [/\bstreet\b/g, "st"],
  [/\bst\.?\b/g, "st"],
  [/\bavenue\b/g, "ave"],
  [/\bave\.?\b/g, "ave"],
  [/\bboulevard\b/g, "blvd"],
  [/\bblvd\.?\b/g, "blvd"],
  [/\broad\b/g, "rd"],
  [/\brd\.?\b/g, "rd"],
  [/\bdrive\b/g, "dr"],
  [/\bdr\.?\b/g, "dr"],
  [/\bplace\b/g, "pl"],
  [/\bpl\.?\b/g, "pl"],
];

export function addressKey(addressRaw: string, city: string): string {
  let a = addressRaw
    .trim()
    .toLowerCase()
    .replace(/\./g, "")          // drop ALL periods (St., Ave., etc.)
    .replace(/[\s,]+/g, " ")
    .replace(/\bunit\s+/g, "#");
  for (const [pattern, replacement] of STREET_SUFFIX_MAP) {
    a = a.replace(pattern, replacement);
  }
  // Collapse any spaces introduced by replacements.
  a = a.replace(/\s+/g, " ").trim();
  return `${a}|${city.trim().toLowerCase()}`;
}
