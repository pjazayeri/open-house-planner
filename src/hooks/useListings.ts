import { useState, useEffect, useMemo, useCallback } from "react";
import type { Listing, TimeSlotGroup, VisitRecord } from "../types";
import { loadCsv } from "../utils/parseCsv";
import { filterAndTransform, getCities } from "../utils/filterListings";
import { optimizeRoute } from "../utils/routeOptimizer";
import { useHiddenIds } from "./useHiddenIds";
import { useVisits } from "./useVisits";
import { useGeolocation } from "./useGeolocation";

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
  hiddenCount: number;
  hideListing: (id: string) => void;
  clearHidden: () => void;
  // Visit state
  visits: Record<string, VisitRecord>;
  markVisited: (id: string) => void;
  setLiked: (id: string, liked: boolean | null) => void;
  setNotes: (id: string, notes: string) => void;
  clearVisit: (id: string) => void;
  // Geolocation
  geoPosition: { lat: number; lng: number } | null;
  nearbyId: string | null;
  geoWatching: boolean;
  geoError: string | null;
  startGeo: () => void;
}

export function useListings(): UseListingsResult {
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { hiddenIds, hide, clearHidden } = useHiddenIds();
  const { visits, markVisited, setLiked: rawSetLiked, setNotes, clearVisit } = useVisits();
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

  // When a listing is disliked, hide it automatically
  const setLiked = useCallback(
    (id: string, liked: boolean | null) => {
      rawSetLiked(id, liked);
      if (liked === false) hideListing(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawSetLiked]
  );

  const cities = useMemo(() => getCities(allListings), [allListings]);

  const cityListings = useMemo(
    () => allListings.filter((l) => l.city === selectedCity && !hiddenIds.has(l.id)),
    [allListings, selectedCity, hiddenIds]
  );

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
    hiddenCount: hiddenIds.size,
    hideListing,
    clearHidden,
    visits,
    markVisited,
    setLiked,
    setNotes,
    clearVisit,
    geoPosition,
    nearbyId,
    geoWatching,
    geoError,
    startGeo,
  };
}
