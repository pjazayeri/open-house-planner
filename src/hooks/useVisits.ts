import { useState, useCallback, useEffect } from "react";
import type { VisitRecord } from "../types";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { SyncStatus } from "../utils/cloudSync";

interface UseVisitsResult {
  visits: Record<string, VisitRecord>;
  markVisited: (id: string) => void;
  setLiked: (id: string, liked: boolean | null) => void;
  setNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  toggleWantOffer: (id: string) => void;
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
        if (!base[id]) return base; // never implicitly create a visit
        const next = { ...base, [id]: { ...base[id], ...patch } };
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
          [id]: { visitedAt: new Date().toISOString(), liked: null, pros: "", cons: "", wantOffer: false },
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

  const setNoteField = useCallback(
    (id: string, field: "pros" | "cons", value: string) => update(id, { [field]: value }),
    [update]
  );

  const toggleWantOffer = useCallback(
    (id: string) => {
      setVisits((prev) => {
        const base = prev ?? {};
        if (!base[id]) return base;
        const next = { ...base, [id]: { ...base[id], wantOffer: !base[id].wantOffer } };
        persist(next);
        return next;
      });
    },
    [persist]
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

  return { visits: visits ?? {}, markVisited, setLiked, setNoteField, toggleWantOffer, clearVisit, syncStatus, saveFailed };
}
