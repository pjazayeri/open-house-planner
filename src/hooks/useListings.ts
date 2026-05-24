import { useState, useEffect, useMemo, useCallback } from "react";
import type { Listing, TimeSlotGroup, VisitRecord } from "../types";
import { loadCsv, loadDemoCsv, uploadCsvText } from "../utils/parseCsv";
import { filterAndTransform, transformAll, getCities } from "../utils/filterListings";
import { shiftListingsToFuture } from "../utils/demoSeed";
import { relinkIds, relinkIdSet } from "../utils/relinkIds";
import { optimizeRoute } from "../utils/routeOptimizer";
import { useHiddenIds } from "./useHiddenIds";
import { useVisits } from "./useVisits";
import { useGeolocation } from "./useGeolocation";
import type { SyncStatus } from "../utils/cloudSync";
import { cloudFetch, cloudPatch, getAuthHeaders } from "../utils/cloudSync";
import { useListingSnapshots } from "./useListingSnapshots";
import { useAmenities } from "./useAmenities";
import type { ListingAmenities } from "../utils/cloudSync";

/** Haversine distance in miles */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const NEARBY_MILES = 0.062; // ~100 meters

interface UseListingsResult {
  loading: boolean;
  needsCsvUpload: boolean;
  error: string | null;
  allListings: Listing[];
  allFavoritesListings: Listing[];
  archivedListings: Listing[];
  cities: string[];
  selectedCity: string;
  setSelectedCity: (city: string) => void;
  timeSlotGroups: TimeSlotGroup[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  hiddenIds: Set<string>;
  hiddenCount: number;
  hideListing: (id: string) => void;
  unhideListing: (id: string) => void;
  clearHidden: () => void;
  priorityIds: Set<string>;
  priorityOrder: string[];
  togglePriority: (id: string) => void;
  reorderPriority: (newOrder: string[]) => void;
  skippedForDay: Record<string, string[]>;
  skipForDay: (id: string, date: string) => void;
  restoreSkippedForDay: (date: string) => void;
  // Visit state
  visits: Record<string, VisitRecord>;
  markVisited: (id: string) => void;
  setLiked: (id: string, liked: boolean | null) => void;
  setRating: (id: string, rating: number | null) => void;
  setNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  toggleWantOffer: (id: string) => void;
  clearVisit: (id: string) => void;
  importData: (hiddenIds: string[], priorityIds: string[], visits: Record<string, VisitRecord>) => void;
  // Amenities (parking, in-unit W/D)
  amenities: Record<string, ListingAmenities>;
  setAmenity: (id: string, field: "parking" | "laundry", value: boolean | undefined) => void;
  uploadListings: (csvText: string) => Promise<number>;
  // Geolocation
  geoPosition: { lat: number; lng: number } | null;
  nearbyId: string | null;
  geoWatching: boolean;
  geoError: string | null;
  startGeo: () => void;
  // Cloud sync
  syncStatus: SyncStatus;
  saveFailed: boolean;
}

export function useListings(authMode: "loading" | "signed-in" | "guest" | "demo" | "signed-out" = "signed-in"): UseListingsResult {
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [allFavoritesListings, setAllFavoritesListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsCsvUpload, setNeedsCsvUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { hiddenIds, hide, unhide, clearHidden, priorityIds, priorityOrder, togglePriority, reorderPriority, importHiddenAndPriority, skippedForDay, skipForDay, restoreSkippedForDay, syncStatus: hiddenStatus, saveFailed: hiddenSaveFailed } = useHiddenIds(authMode);
  const { saveSnapshots, archivedListings } = useListingSnapshots();
  const { visits, markVisited, setLiked, setRating, setNoteField, toggleWantOffer, clearVisit, importVisits, syncStatus: visitsStatus, saveFailed: visitsSaveFailed } = useVisits(authMode);
  const { amenities, setAmenity } = useAmenities();

  const syncStatus: SyncStatus =
    hiddenStatus === "loading"  || visitsStatus === "loading"  ? "loading" :
    hiddenStatus === "error"    || visitsStatus === "error"    ? "error" :
    hiddenStatus === "unconfigured"                            ? "unconfigured" :
    hiddenStatus === "degraded" || visitsStatus === "degraded" ? "degraded" :
    "ok";
  const saveFailed = hiddenSaveFailed || visitsSaveFailed;
  const { position: geoPosition, error: geoError, watching: geoWatching, startWatching: startGeo } = useGeolocation();

  useEffect(() => {
    // Wait for auth to resolve before fetching cloud state — avoids loading CSV
    // without auth context (which would miss the user's csvUrl)
    if (authMode === "loading" || authMode === "signed-out") return;

    (async () => {
      try {
        let rows;
        if (authMode === "demo") {
          // Demo mode: bundled CSV, no cloud, dates rolled forward so the
          // Planner has visible open houses.
          rows = await loadDemoCsv();
        } else {
          // Fire cloudFetch and getAuthHeaders in parallel — no need to wait for
          // cloud state before starting the auth header fetch.
          const [stateResult, authHeaders] = await Promise.all([
            cloudFetch().catch((e) => { console.warn("[useListings] cloudFetch failed:", e); return null; }),
            getAuthHeaders(),
          ]);
          // csvUrl from cloud state; for signed-in users it's always "/api/csv"
          const csvUrl = stateResult?.csvUrl;
          rows = await loadCsv(csvUrl, Object.keys(authHeaders).length ? authHeaders : undefined);
        }
        if (rows.length === 0) {
          setNeedsCsvUpload(true);
        } else {
          let filtered = filterAndTransform(rows);
          let all = transformAll(rows);
          if (authMode === "demo") {
            filtered = shiftListingsToFuture(filtered);
            all = shiftListingsToFuture(all);
          }
          setAllListings(filtered);
          setAllFavoritesListings(all);
          const cities = getCities(filtered);
          if (cities.length > 0) setSelectedCity(cities[0]);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [authMode]);

  const hideListing = (id: string) => {
    hide(id);
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const unhideListing = (id: string) => unhide(id);


  const cities = useMemo(() => getCities(allListings), [allListings]);

  const cityListings = useMemo(() => {
    const now = new Date();
    return allListings.filter(
      (l) => l.city === selectedCity && !hiddenIds.has(l.id) && l.openHouseEnd > now
    );
  }, [allListings, selectedCity, hiddenIds]);

  const timeSlotGroups = useMemo(
    () => optimizeRoute(cityListings),
    [cityListings]
  );

  // Snapshot every listing the user references — visited OR starred (priority)
  // OR hidden — to cloud + localStorage so they survive future CSV updates.
  // This is what lets relinkIds() heal a star/hide after Redfin re-lists the
  // property with a new MLS#: the snapshot preserves the old MLS# → address
  // mapping. (Previously only *visited* listings were snapshotted, so a
  // starred-but-unvisited priority had no snapshot and couldn't be relinked.)
  useEffect(() => {
    const referenced = allListings.filter(
      (l) => visits[l.id] || priorityIds.has(l.id) || hiddenIds.has(l.id)
    );
    if (referenced.length > 0) saveSnapshots(referenced);
  }, [allListings, visits, priorityIds, hiddenIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Self-heal priorityOrder + hiddenIds when Redfin re-lists a property
  // with a new MLS#. Without this, starring a property and then re-uploading
  // a CSV where that property has a new MLS# silently drops the star.
  // Matches orphaned ids to current listings by address+city via archived
  // snapshots.
  useEffect(() => {
    if (allFavoritesListings.length === 0) return;
    if (hiddenIds === null) return; // still loading
    if (priorityOrder.length === 0 && hiddenIds.size === 0) return;
    if (authMode !== "signed-in") return; // guest/demo have no cloud to update

    const p = relinkIds(priorityOrder, allFavoritesListings, archivedListings);
    const h = relinkIdSet(hiddenIds, allFavoritesListings, archivedListings);
    const total = Object.keys(p.remappings).length + Object.keys(h.remappings).length;
    if (total === 0) return;

    console.info(
      `[relinkIds] Re-linked ${total} ids after MLS# change ` +
      `(priorities: ${Object.keys(p.remappings).length}, hidden: ${Object.keys(h.remappings).length})`
    );
    importHiddenAndPriority(Array.from(h.ids), p.ids);
  }, [allFavoritesListings, archivedListings, priorityOrder, hiddenIds, authMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrap markVisited to immediately snapshot the listing — avoids data loss
  // if the CSV is later updated to exclude this listing before the effect fires.
  const markVisitedWithSnapshot = useCallback((id: string) => {
    markVisited(id);
    const listing = allListings.find((l) => l.id === id);
    if (listing) saveSnapshots([listing]);
  }, [markVisited, allListings, saveSnapshots]); // eslint-disable-line react-hooks/exhaustive-deps

  // Find listing within NEARBY_MILES of user's position
  const nearbyId = useMemo(() => {
    if (!geoPosition) return null;
    const allVisible = timeSlotGroups.flatMap((g) => g.listings);
    let best: { id: string; dist: number } | null = null;
    for (const l of allVisible) {
      const d = haversine(geoPosition.lat, geoPosition.lng, l.lat, l.lng);
      if (d < NEARBY_MILES && (!best || d < best.dist)) {
        best = { id: l.id, dist: d };
      }
    }
    return best?.id ?? null;
  }, [geoPosition, timeSlotGroups]);

  return {
    loading,
    needsCsvUpload,
    error,
    allListings,
    allFavoritesListings,
    archivedListings,
    cities,
    selectedCity,
    setSelectedCity,
    timeSlotGroups,
    selectedId,
    setSelectedId,
    hoveredId,
    setHoveredId,
    hiddenIds,
    hiddenCount: hiddenIds.size,
    hideListing,
    unhideListing,
    clearHidden,
    priorityIds,
    priorityOrder,
    togglePriority,
    reorderPriority,
    skippedForDay,
    skipForDay,
    restoreSkippedForDay,
    visits,
    markVisited: markVisitedWithSnapshot,
    setLiked,
    setRating,
    toggleWantOffer,
    setNoteField,
    clearVisit,
    amenities,
    setAmenity,
    importData: (h: string[], p: string[], v: Record<string, VisitRecord>) => {
      importHiddenAndPriority(h, p);
      importVisits(v);
    },
    uploadListings: async (csvText: string) => {
      const rows = await uploadCsvText(csvText);
      const filtered = filterAndTransform(rows);
      setAllListings(filtered);
      setAllFavoritesListings(transformAll(rows));
      setNeedsCsvUpload(false);
      const cities = getCities(filtered);
      if (cities.length > 0) setSelectedCity(cities[0]);
      // Background: save to Vercel Blob and persist URL to user's cloud state
      (async () => {
        try {
          const authHeaders = await getAuthHeaders();
          const r = await fetch("/api/ingest", {
            method: "POST",
            headers: { "Content-Type": "text/csv", ...authHeaders },
            body: csvText,
          });
          if (r.ok) {
            const d = (await r.json()) as { csvUrl?: string };
            if (d.csvUrl) {
              await cloudPatch({ csvUrl: d.csvUrl });
            }
          }
        } catch (e) {
          console.error("[uploadListings] background persist failed:", e);
        }
      })();
      return filtered.length;
    },
    geoPosition,
    nearbyId,
    geoWatching,
    geoError,
    startGeo,
    syncStatus,
    saveFailed,
  };
}
