import { useState, useCallback, useEffect } from "react";
import type { VisitRecord } from "../types";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { SyncStatus } from "../utils/cloudSync";

interface UseVisitsResult {
  visits: Record<string, VisitRecord>;
  markVisited: (id: string) => void;
  setLiked: (id: string, liked: boolean | null) => void;
  setRating: (id: string, rating: number | null) => void;
  setNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  toggleWantOffer: (id: string) => void;
  clearVisit: (id: string) => void;
  importVisits: (visits: Record<string, VisitRecord>) => void;
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
        const isAuth = err instanceof Error && (err as { authError?: boolean }).authError;
        if (isAuth) {
          setVisits({});
          setSyncStatus("degraded");
        } else {
          setSyncStatus("error");
        }
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
          [id]: { visitedAt: new Date().toISOString(), liked: null, rating: null, pros: "", cons: "", wantOffer: false },
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

  const setRating = useCallback(
    (id: string, rating: number | null) => update(id, { rating }),
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

  const importVisits = useCallback((v: Record<string, VisitRecord>) => {
    setVisits(v);
    if (USE_CLOUD) {
      setSaveFailed(false);
      cloudPatch({ visits: v }).catch(() => setSaveFailed(true));
    }
  }, []);

  return { visits: visits ?? {}, markVisited, setLiked, setRating, setNoteField, toggleWantOffer, clearVisit, importVisits, syncStatus, saveFailed };
}
