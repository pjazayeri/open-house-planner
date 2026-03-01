import { useState, useCallback } from "react";
import type { VisitRecord } from "../types";

const LS_KEY = "open-house-visits";

function lsLoad(): Record<string, VisitRecord> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, VisitRecord>) : {};
  } catch {
    return {};
  }
}

function lsSave(v: Record<string, VisitRecord>) {
  localStorage.setItem(LS_KEY, JSON.stringify(v));
}

interface UseVisitsResult {
  visits: Record<string, VisitRecord>;
  markVisited: (id: string) => void;
  setLiked: (id: string, liked: boolean | null) => void;
  setNotes: (id: string, notes: string) => void;
  clearVisit: (id: string) => void;
}

export function useVisits(): UseVisitsResult {
  const [visits, setVisits] = useState<Record<string, VisitRecord>>(lsLoad);

  const update = useCallback((id: string, patch: Partial<VisitRecord>) => {
    setVisits((prev) => {
      const existing: VisitRecord = prev[id] ?? {
        visitedAt: new Date().toISOString(),
        liked: null,
        notes: "",
      };
      const next = { ...prev, [id]: { ...existing, ...patch } };
      lsSave(next);
      return next;
    });
  }, []);

  const markVisited = useCallback((id: string) => {
    setVisits((prev) => {
      if (prev[id]) return prev;
      const next = {
        ...prev,
        [id]: { visitedAt: new Date().toISOString(), liked: null, notes: "" },
      };
      lsSave(next);
      return next;
    });
  }, []);

  const setLiked = useCallback(
    (id: string, liked: boolean | null) => update(id, { liked }),
    [update]
  );

  const setNotes = useCallback(
    (id: string, notes: string) => update(id, { notes }),
    [update]
  );

  const clearVisit = useCallback((id: string) => {
    setVisits((prev) => {
      const next = { ...prev };
      delete next[id];
      lsSave(next);
      return next;
    });
  }, []);

  return { visits, markVisited, setLiked, setNotes, clearVisit };
}
