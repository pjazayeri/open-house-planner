import { useState, useCallback, useEffect } from "react";
import type { VisitRecord } from "../types";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { SyncStatus } from "../utils/cloudSync";

interface UseVisitsResult {
  visits: Record<string, VisitRecord>;
  markVisited: (id: string) => void;
  setLiked: (id: string, liked: boolean | null) => void;
  setNotes: (id: string, notes: string) => void;
  clearVisit: (id: string) => void;
  syncStatus: SyncStatus;
  saveFailed: boolean;
}

export function useVisits(): UseVisitsResult {
  const [visits, setVisits] = useState<Record<string, VisitRecord> | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    USE_CLOUD ? "loading" : "unconfigured"
  );
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!USE_CLOUD) {
      setVisits({});
      return;
    }
    cloudFetch()
      .then((state) => {
        setVisits(state.visits);
        setSyncStatus("ok");
      })
      .catch((err: unknown) => {
        console.error("[useVisits] cloud fetch failed:", err);
        setSyncStatus("error");
      });
  }, []);

  const persist = useCallback((v: Record<string, VisitRecord>) => {
    if (!USE_CLOUD) return;
    setSaveFailed(false);
    cloudPatch({ visits: v }).catch(() => setSaveFailed(true));
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<VisitRecord>) => {
      setVisits((prev) => {
        const base = prev ?? {};
        const existing: VisitRecord = base[id] ?? {
          visitedAt: new Date().toISOString(),
          liked: null,
          notes: "",
        };
        const next = { ...base, [id]: { ...existing, ...patch } };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const markVisited = useCallback(
    (id: string) => {
      setVisits((prev) => {
        const base = prev ?? {};
        if (base[id]) return base;
        const next = {
          ...base,
          [id]: { visitedAt: new Date().toISOString(), liked: null, notes: "" },
        };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setLiked = useCallback(
    (id: string, liked: boolean | null) => update(id, { liked }),
    [update]
  );

  const setNotes = useCallback(
    (id: string, notes: string) => update(id, { notes }),
    [update]
  );

  const clearVisit = useCallback(
    (id: string) => {
      setVisits((prev) => {
        const next = { ...(prev ?? {}) };
        delete next[id];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  return { visits: visits ?? {}, markVisited, setLiked, setNotes, clearVisit, syncStatus, saveFailed };
}
