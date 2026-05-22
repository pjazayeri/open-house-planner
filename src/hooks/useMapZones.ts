import { useState, useCallback, useEffect } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { MapZone } from "../types";
import type { AuthMode } from "./useAuth";

interface UseMapZonesResult {
  zones: MapZone[];
  addZone: (zone: MapZone) => void;
  updateZone: (id: string, polygon: [number, number][]) => void;
  removeZone: (id: string) => void;
  renameZone: (id: string, name: string) => void;
}

export function useMapZones(authMode: AuthMode): UseMapZonesResult {
  const [zones, setZones] = useState<MapZone[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authMode === "loading" || authMode === "signed-out") return;
    if (!USE_CLOUD || authMode === "guest" || authMode === "demo") {
      setZones([]);
      setLoaded(true);
      return;
    }
    cloudFetch()
      .then((state) => {
        setZones(state.mapZones ?? []);
        setLoaded(true);
      })
      .catch((err) => {
        console.error("[useMapZones] cloud fetch failed:", err);
        // Don't mark loaded — leaves persist() guarded so we can't overwrite
        // the cloud copy with an empty local state.
      });
  }, [authMode]);

  const persist = useCallback(
    (z: MapZone[]) => {
      if (!USE_CLOUD) return;
      // Skip writes until the initial load succeeded; otherwise an early
      // mutation would clobber the existing cloud zones with our empty local state.
      if (!loaded) return;
      cloudPatch({ mapZones: z }).catch(console.error);
    },
    [loaded]
  );

  const addZone = useCallback(
    (zone: MapZone) => {
      setZones((prev) => {
        const next = [...prev, zone];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const updateZone = useCallback(
    (id: string, polygon: [number, number][]) => {
      setZones((prev) => {
        const next = prev.map((z) => (z.id === id ? { ...z, polygon } : z));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeZone = useCallback(
    (id: string) => {
      setZones((prev) => {
        const next = prev.filter((z) => z.id !== id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const renameZone = useCallback(
    (id: string, name: string) => {
      setZones((prev) => {
        const next = prev.map((z) => (z.id === id ? { ...z, name } : z));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return { zones, addZone, updateZone, removeZone, renameZone };
}
