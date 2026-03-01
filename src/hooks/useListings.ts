import { useState, useEffect, useMemo, useCallback } from "react";
import type { Listing, TimeSlotGroup } from "../types";
import { loadCsv } from "../utils/parseCsv";
import { filterAndTransform, getCities } from "../utils/filterListings";
import { optimizeRoute } from "../utils/routeOptimizer";

const HIDDEN_IDS_KEY = "open-house-hidden-ids";

function loadHiddenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_IDS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenIds(ids: Set<string>) {
  localStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify(Array.from(ids)));
}

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
}

export function useListings(): UseListingsResult {
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(loadHiddenIds);

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

  const hideListing = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveHiddenIds(next);
      return next;
    });
    setSelectedId((prev) => (prev === id ? null : prev));
  }, []);

  const clearHidden = useCallback(() => {
    setHiddenIds(new Set());
    saveHiddenIds(new Set());
  }, []);

  const cities = useMemo(() => getCities(allListings), [allListings]);

  const cityListings = useMemo(
    () => allListings.filter((l) => l.city === selectedCity && !hiddenIds.has(l.id)),
    [allListings, selectedCity, hiddenIds]
  );

  const timeSlotGroups = useMemo(
    () => optimizeRoute(cityListings),
    [cityListings]
  );

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
  };
}
