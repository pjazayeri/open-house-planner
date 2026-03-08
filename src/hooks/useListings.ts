import { useState, useEffect, useMemo } from "react";
import type { Listing, TimeSlotGroup, VisitRecord } from "../types";
import { loadCsv, uploadCsvText } from "../utils/parseCsv";
import { filterAndTransform, getCities } from "../utils/filterListings";
import { optimizeRoute } from "../utils/routeOptimizer";
import { useHiddenIds } from "./useHiddenIds";
import { useVisits } from "./useVisits";
import { useGeolocation } from "./useGeolocation";
import type { SyncStatus } from "../utils/cloudSync";

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
  error: string | null;
  allListings: Listing[];
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
  togglePriority: (id: string) => void;
  // Visit state
  visits: Record<string, VisitRecord>;
  markVisited: (id: string) => void;
  setLiked: (id: string, liked: boolean | null) => void;
  setRating: (id: string, rating: number | null) => void;
  setNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  toggleWantOffer: (id: string) => void;
  clearVisit: (id: string) => void;
  importData: (hiddenIds: string[], priorityIds: string[], visits: Record<string, VisitRecord>) => void;
  uploadListings: (csvText: string) => Promise<void>;
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

export function useListings(): UseListingsResult {
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { hiddenIds, hide, unhide, clearHidden, priorityIds, togglePriority, importHiddenAndPriority, syncStatus: hiddenStatus, saveFailed: hiddenSaveFailed } = useHiddenIds();
  const { visits, markVisited, setLiked, setRating, setNoteField, toggleWantOffer, clearVisit, importVisits, syncStatus: visitsStatus, saveFailed: visitsSaveFailed } = useVisits();

  const syncStatus: SyncStatus =
    hiddenStatus === "loading"  || visitsStatus === "loading"  ? "loading" :
    hiddenStatus === "error"    || visitsStatus === "error"    ? "error" :
    hiddenStatus === "unconfigured"                            ? "unconfigured" :
    hiddenStatus === "degraded" || visitsStatus === "degraded" ? "degraded" :
    "ok";
  const saveFailed = hiddenSaveFailed || visitsSaveFailed;
  const { position: geoPosition, error: geoError, watching: geoWatching, startWatching: startGeo } = useGeolocation();

  useEffect(() => {
    loadCsv()
      .then((rows) => {
        const filtered = filterAndTransform(rows);
        setAllListings(filtered);
        const cities = getCities(filtered);
        if (cities.length > 0) setSelectedCity(cities[0]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
    error,
    allListings,
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
    togglePriority,
    visits,
    markVisited,
    setLiked,
    setRating,
    toggleWantOffer,
    setNoteField,
    clearVisit,
    importData: (h: string[], p: string[], v: Record<string, VisitRecord>) => {
      importHiddenAndPriority(h, p);
      importVisits(v);
    },
    uploadListings: async (csvText: string) => {
      const rows = await uploadCsvText(csvText);
      const filtered = filterAndTransform(rows);
      setAllListings(filtered);
      const cities = getCities(filtered);
      if (cities.length > 0) setSelectedCity(cities[0]);
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
