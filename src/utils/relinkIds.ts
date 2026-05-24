import type { Listing } from "../types";

/**
 * Re-link orphaned IDs (priorities, hides) by address when MLS# changes.
 *
 * Background: each listing's `id` is its MLS#. We store user state
 * (priorityOrder, hiddenIds) as arrays of MLS#s. When Redfin re-lists a
 * property — different brokerage, different MLS source, same address —
 * the MLS# changes. Without this helper, the user's stars/hides for that
 * property silently disappear because the old MLS# isn't in the new CSV.
 *
 * The fix: for each id NOT present in the current CSV, look up its
 * address+city in the archived snapshots, then find the listing in the
 * current CSV with the same address+city and substitute its (new) id.
 *
 * Returns the rewritten id list plus a remappings map for telemetry /
 * user notification.
 */
export interface RelinkResult {
  ids: string[];
  remappings: Record<string, string>;
}

// Street-type normalization so "100 Main Street" and "100 Main St."
// resolve to the same key.
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

function addressKey(addressRaw: string, city: string): string {
  // Aggressive normalization so trailing whitespace, casing, #/Unit
  // spacing, "Street" vs "St.", and trailing periods don't block a match
  // between an archived snapshot and a current row.
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

export function relinkIds(
  oldIds: readonly string[],
  current: readonly Listing[],
  archived: readonly Listing[],
): RelinkResult {
  const currentIds = new Set(current.map((l) => l.id));
  const currentByAddr = new Map<string, string>();
  for (const l of current) currentByAddr.set(addressKey(l.address, l.city), l.id);
  const archivedById = new Map<string, Listing>();
  for (const l of archived) archivedById.set(l.id, l);

  const ids: string[] = [];
  const remappings: Record<string, string> = {};
  const seen = new Set<string>();

  for (const id of oldIds) {
    if (currentIds.has(id)) {
      if (!seen.has(id)) {
        ids.push(id);
        seen.add(id);
      }
      continue;
    }
    // Orphaned — try to relink by address.
    const snap = archivedById.get(id);
    if (!snap) {
      // No archived data → can't relink. Keep the old id so the user's
      // intent is preserved if the listing comes back later.
      if (!seen.has(id)) {
        ids.push(id);
        seen.add(id);
      }
      continue;
    }
    const newId = currentByAddr.get(addressKey(snap.address, snap.city));
    if (newId && !currentIds.has(id)) {
      remappings[id] = newId;
      if (!seen.has(newId)) {
        ids.push(newId);
        seen.add(newId);
      }
    } else {
      // No match in current — keep orphan id so a future CSV re-import
      // can still resolve it.
      if (!seen.has(id)) {
        ids.push(id);
        seen.add(id);
      }
    }
  }
  return { ids, remappings };
}

/**
 * Same logic, but operating on a Set<string> (hiddenIds uses Set, not array).
 * Order doesn't matter for Sets, so we return a Set.
 */
export function relinkIdSet(
  oldIds: ReadonlySet<string>,
  current: readonly Listing[],
  archived: readonly Listing[],
): { ids: Set<string>; remappings: Record<string, string> } {
  const result = relinkIds(Array.from(oldIds), current, archived);
  return { ids: new Set(result.ids), remappings: result.remappings };
}
