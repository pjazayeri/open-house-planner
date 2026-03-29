import { useState, useCallback, useEffect } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { MapZone } from "../types";

interface UseMapZonesResult {
  zones: MapZone[];
  addZone: (zone: MapZone) => void;
  updateZone: (id: string, polygon: [number, number][]) => void;
  removeZone: (id: string) => void;
  renameZone: (id: string, name: string) => void;
}

export function useMapZones(): UseMapZonesResult {
  const [zones, setZones] = useState<MapZone[]>([]);

  useEffect(() => {
    if (!USE_CLOUD) return;
    cloudFetch()
      .then((state) => setZones(state.mapZones ?? []))
      .catch(() => {});
  }, []);

  const persist = useCallback((z: MapZone[]) => {
    if (!USE_CLOUD) return;
    cloudPatch({ mapZones: z }).catch(console.error);
  }, []);

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
