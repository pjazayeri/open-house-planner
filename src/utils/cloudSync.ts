/**
 * Shared cloud sync for all cross-device state, backed by Neon Postgres.
 *
 * Each user's state is one JSONB row in `user_state` keyed by Firebase uid:
 *   { hiddenIds: string[], priorityIds: string[], visits: {...}, ... }
 *
 * Writes send only the changed top-level keys; the server applies them with
 * an atomic JSONB `||` merge, so two hooks writing different keys never
 * clobber each other (no client-side GET-then-PUT round-trip).
 */
import type { VisitRecord, MapZone } from "../types";

// Sync is always enabled — secrets live on the server, never in the bundle.
// Set VITE_SYNC_DISABLED=true in .env.local to run offline without errors.
export const USE_CLOUD = import.meta.env.VITE_SYNC_DISABLED !== "true";

export type SyncStatus = "unconfigured" | "loading" | "ok" | "error" | "degraded";

// Auth context — set by useAuth before the main app mounts.
// getToken() returns a fresh Firebase ID token (auto-refreshed by the SDK).
// The server derives the per-user row key (uid) from this token; the client
// no longer tracks a storage id.
let _getToken: (() => Promise<string>) | null = null;
let _guestMode = false;

export function setAuthContext(getToken: () => Promise<string>) {
  _getToken = getToken;
  _guestMode = false;
  // Invalidate any cached fetch made before auth was set so the next
  // cloudFetch() runs with the authenticated token.
  _pendingFetch = null;
}

export function setGuestMode() {
  _guestMode = true;
  _getToken = null;
}

export function clearAuthContext() {
  _getToken = null;
  _guestMode = false;
  _pendingFetch = null;
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!_getToken) return {};
  const token = await _getToken();
  return { Authorization: `Bearer ${token}` };
}

const BIN_URL = `/api/sync`;

export interface ListingAmenities {
  parking?: boolean;  // undefined = unknown
  laundry?: boolean;  // undefined = unknown (in-unit W/D)
}

export interface CloudState {
  hiddenIds: string[];
  priorityIds: string[];
  visits: Record<string, VisitRecord>;
  listingSnapshots: Record<string, unknown>;
  skippedForDay: Record<string, string[]>;  // date → listing IDs hidden for that day only
  mapZones: MapZone[];
  finFavoriteIds: string[];
  amenities: Record<string, ListingAmenities>;
  rentEstimates: Record<string, unknown>; // typed as RentEstimate in useRentEstimates.ts
  csvUrl?: string; // user's own CSV stored in Vercel Blob
  // URL-encoded query string of the user's saved Open Houses filter state
  // (sortKey, activeFilters, search, hood/area, date/time, status, price,
  // capRate, ppsf). Acts as a user-default overlay: shared URLs always
  // take precedence; cloud fills in only when the URL has no filter params.
  filters?: string;
  // Saved UI theme ("dark" | "light"). Per-user, cross-device. Guest mode
  // is local-only (localStorage). Falls back to OS preference if absent.
  theme?: string;
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

  const amenities: Record<string, ListingAmenities> = {};
  if (r.amenities && typeof r.amenities === "object" && !Array.isArray(r.amenities)) {
    for (const [id, a] of Object.entries(r.amenities as Record<string, unknown>)) {
      const av = a && typeof a === "object" ? (a as Record<string, unknown>) : {};
      const entry: ListingAmenities = {};
      if (av.parking === true) entry.parking = true;
      else if (av.parking === false) entry.parking = false;
      if (av.laundry === true) entry.laundry = true;
      else if (av.laundry === false) entry.laundry = false;
      amenities[id] = entry;
    }
  }

  const rentEstimates: Record<string, unknown> =
    r.rentEstimates && typeof r.rentEstimates === "object" && !Array.isArray(r.rentEstimates)
      ? (r.rentEstimates as Record<string, unknown>)
      : {};

  return {
    hiddenIds: Array.isArray(r.hiddenIds) ? (r.hiddenIds as string[]) : [],
    priorityIds: Array.isArray(r.priorityIds) ? (r.priorityIds as string[]) : [],
    visits,
    listingSnapshots,
    skippedForDay,
    mapZones,
    finFavoriteIds: Array.isArray(r.finFavoriteIds) ? (r.finFavoriteIds as string[]) : [],
    amenities,
    rentEstimates,
    csvUrl: typeof r.csvUrl === "string" ? r.csvUrl : undefined,
    filters: typeof r.filters === "string" ? r.filters : undefined,
    theme: r.theme === "dark" || r.theme === "light" ? r.theme : undefined,
  };
}

// Deduplicate concurrent fetches (React StrictMode fires effects twice).
let _pendingFetch: Promise<CloudState> | null = null;

export async function cloudFetch(): Promise<CloudState> {
  if (_guestMode) return parseCloudState({});
  if (_pendingFetch) return _pendingFetch;

  _pendingFetch = (async () => {
    if (!_getToken) {
      throw Object.assign(new Error("Auth context not ready"), { authError: true });
    }
    const headers = { "Authorization": `Bearer ${await _getToken()}` };
    const res = await fetch(BIN_URL, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[cloudSync] fetch failed ${res.status}:`, body.slice(0, 200));
      const err = Object.assign(new Error(`sync ${res.status}`), {
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
 * Persist a partial state update. Only the changed top-level keys are sent;
 * the server applies them with an atomic JSONB merge, so concurrent writes to
 * different keys can't clobber each other (no read-modify-write here).
 */
export async function cloudPatch(patch: Partial<CloudState>): Promise<void> {
  if (_guestMode) return;
  if (!_getToken) return;
  const res = await fetch(BIN_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${await _getToken()}`,
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[cloudSync] patch failed ${res.status}:`, body.slice(0, 200));
    throw new Error(`sync ${res.status}`);
  }
}
