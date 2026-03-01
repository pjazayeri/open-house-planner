/**
 * Shared JSONBin.io sync for all cross-device state.
 *
 * The bin stores a single JSON object:
 *   { hiddenIds: string[], visits: Record<string, VisitRecord> }
 *
 * Every write does a GET-then-PUT so that two hooks writing different
 * fields never clobber each other's data.
 */
import { JSONBIN_API_KEY, JSONBIN_BIN_ID } from "../config";
import type { VisitRecord } from "../types";

export const USE_CLOUD = JSONBIN_API_KEY !== "" && JSONBIN_BIN_ID !== "";

const BIN_URL = `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}`;
const HEADERS = { "X-Access-Key": JSONBIN_API_KEY };

export interface CloudState {
  hiddenIds: string[];
  visits: Record<string, VisitRecord>;
}

function parseCloudState(record: unknown): CloudState {
  const r = record && typeof record === "object" ? (record as Record<string, unknown>) : {};
  return {
    hiddenIds: Array.isArray(r.hiddenIds) ? (r.hiddenIds as string[]) : [],
    visits:
      r.visits && typeof r.visits === "object" && !Array.isArray(r.visits)
        ? (r.visits as Record<string, VisitRecord>)
        : {},
  };
}

export async function cloudFetch(): Promise<CloudState> {
  const res = await fetch(`${BIN_URL}/latest`, { headers: HEADERS });
  if (!res.ok) throw new Error(`JSONBin ${res.status}`);
  const json = (await res.json()) as { record: unknown };
  return parseCloudState(json.record);
}

/**
 * Merge `patch` into the current cloud state and write back.
 * Safe to call from multiple hooks — each only touches its own field.
 */
export async function cloudPatch(patch: Partial<CloudState>): Promise<void> {
  const current = await cloudFetch();
  const merged: CloudState = { ...current, ...patch };
  const res = await fetch(BIN_URL, {
    method: "PUT",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });
  if (!res.ok) throw new Error(`JSONBin ${res.status}`);
}
