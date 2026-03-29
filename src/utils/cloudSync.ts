/**
 * Shared JSONBin.io sync for all cross-device state.
 *
 * The bin stores a single JSON object:
 *   { hiddenIds: string[], visits: Record<string, VisitRecord> }
 *
 * Every write does a GET-then-PUT so that two hooks writing different
 * fields never clobber each other's data.
 */
import type { VisitRecord, MapZone } from "../types";

// Sync is always enabled — secrets live on the server, never in the bundle.
// Set VITE_SYNC_DISABLED=true in .env.local to run offline without errors.
export const USE_CLOUD = import.meta.env.VITE_SYNC_DISABLED !== "true";

export type SyncStatus = "unconfigured" | "loading" | "ok" | "error" | "degraded";

const BIN_URL = `/api/sync`;

export interface CloudState {
  hiddenIds: string[];
  priorityIds: string[];
  visits: Record<string, VisitRecord>;
  listingSnapshots: Record<string, unknown>;
  skippedForDay: Record<string, string[]>;  // date → listing IDs hidden for that day only
  mapZones: MapZone[];
}

function parseVisitRecord(v: unknown): VisitRecord {
  const r = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const legacyNotes = typeof r.notes === "string" ? r.notes : "";
  const rating =
    typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5 ? r.rating : null;
  return {
    visitedAt: typeof r.visitedAt === "string" ? r.visitedAt : new Date().toISOString(),
    liked: r.liked === true ? true : r.liked === false ? false : null,
    rating,
    pros: typeof r.pros === "string" ? r.pros : legacyNotes,
    cons: typeof r.cons === "string" ? r.cons : "",
    wantOffer: r.wantOffer === true,
  };
}

function parseCloudState(record: unknown): CloudState {
  const r = record && typeof record === "object" ? (record as Record<string, unknown>) : {};
  const rawVisits =
    r.visits && typeof r.visits === "object" && !Array.isArray(r.visits)
      ? (r.visits as Record<string, unknown>)
      : {};
  const visits: Record<string, VisitRecord> = {};
  for (const [id, v] of Object.entries(rawVisits)) {
    visits[id] = parseVisitRecord(v);
  }
  const listingSnapshots =
    r.listingSnapshots && typeof r.listingSnapshots === "object" && !Array.isArray(r.listingSnapshots)
      ? (r.listingSnapshots as Record<string, unknown>)
      : {};
  const rawSkipped =
    r.skippedForDay && typeof r.skippedForDay === "object" && !Array.isArray(r.skippedForDay)
      ? (r.skippedForDay as Record<string, unknown>)
      : {};
  const skippedForDay: Record<string, string[]> = {};
  for (const [date, ids] of Object.entries(rawSkipped)) {
    if (Array.isArray(ids)) skippedForDay[date] = ids as string[];
  }
  const mapZones: MapZone[] = [];
  if (Array.isArray(r.mapZones)) {
    for (const z of r.mapZones) {
      if (z && typeof z === "object" && typeof (z as Record<string, unknown>).id === "string") {
        const zr = z as Record<string, unknown>;
        const polygon: [number, number][] = Array.isArray(zr.polygon)
          ? (zr.polygon as unknown[]).filter(
              (pt): pt is [number, number] =>
                Array.isArray(pt) && pt.length === 2 && typeof pt[0] === "number" && typeof pt[1] === "number"
            )
          : [];
        mapZones.push({
          id: zr.id as string,
          name: typeof zr.name === "string" ? zr.name : "Zone",
          color: typeof zr.color === "string" ? zr.color : "#3b82f6",
          polygon,
        });
      }
    }
  }

  return {
    hiddenIds: Array.isArray(r.hiddenIds) ? (r.hiddenIds as string[]) : [],
    priorityIds: Array.isArray(r.priorityIds) ? (r.priorityIds as string[]) : [],
    visits,
    listingSnapshots,
    skippedForDay,
    mapZones,
  };
}

// Deduplicate concurrent fetches (React StrictMode fires effects twice).
let _pendingFetch: Promise<CloudState> | null = null;

export async function cloudFetch(): Promise<CloudState> {
  if (_pendingFetch) return _pendingFetch;

  _pendingFetch = (async () => {
    const res = await fetch(BIN_URL);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[cloudSync] fetch failed ${res.status}:`, body.slice(0, 200));
      const err = Object.assign(new Error(`JSONBin ${res.status}`), {
        authError: res.status === 401,
      });
      throw err;
    }
    const json = (await res.json()) as { record: unknown };
    return parseCloudState(json.record);
  })();

  _pendingFetch.finally(() => setTimeout(() => { _pendingFetch = null; }, 2000)).catch(() => {});
  return _pendingFetch;
}

/**
 * Merge `patch` into the current cloud state and write back.
 */
export async function cloudPatch(patch: Partial<CloudState>): Promise<void> {
  const current = await cloudFetch();
  const merged: CloudState = { ...current, ...patch };
  const res = await fetch(BIN_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(merged),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[cloudSync] patch failed ${res.status}:`, body.slice(0, 200));
    throw new Error(`JSONBin ${res.status}`);
  }
}
