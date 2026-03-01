import { useState, useEffect, useMemo } from "react";
import type { Listing, TimeSlotGroup } from "../types";
import { loadCsv } from "../utils/parseCsv";
import { filterAndTransform, getCities } from "../utils/filterListings";
import { optimizeRoute } from "../utils/routeOptimizer";

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
}

export function useListings(): UseListingsResult {
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

  const cities = useMemo(() => getCities(allListings), [allListings]);

  const cityListings = useMemo(
    () => allListings.filter((l) => l.city === selectedCity),
    [allListings, selectedCity]
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
  };
}
