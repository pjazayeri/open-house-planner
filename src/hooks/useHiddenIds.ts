import { useState, useCallback, useEffect, useMemo } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { SyncStatus } from "../utils/cloudSync";

interface UseHiddenIdsResult {
  hiddenIds: Set<string>;
  hide: (id: string) => void;
  unhide: (id: string) => void;
  clearHidden: () => void;
  priorityIds: Set<string>;
  priorityOrder: string[];
  togglePriority: (id: string) => void;
  reorderPriority: (newOrder: string[]) => void;
  importHiddenAndPriority: (hiddenIds: string[], priorityIds: string[]) => void;
  skippedForDay: Record<string, string[]>;
  skipForDay: (id: string, date: string) => void;
  restoreSkippedForDay: (date: string) => void;
  syncStatus: SyncStatus;
  saveFailed: boolean;
}

export function useHiddenIds(): UseHiddenIdsResult {
  const [hiddenIds, setHiddenIds] = useState<Set<string> | null>(null);
  const [priorityOrder, setPriorityOrder] = useState<string[]>([]);
  const [skippedForDay, setSkippedForDay] = useState<Record<string, string[]>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    USE_CLOUD ? "loading" : "unconfigured"
  );
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!USE_CLOUD) {
      setHiddenIds(new Set());
      return;
    }
    cloudFetch()
      .then((state) => {
        setHiddenIds(new Set(state.hiddenIds));
        setPriorityOrder(state.priorityIds);
        setSkippedForDay(state.skippedForDay ?? {});
        setSyncStatus("ok");
      })
      .catch((err: unknown) => {
        console.error("[useHiddenIds] cloud fetch failed:", err);
        const isAuth = err instanceof Error && (err as { authError?: boolean }).authError;
        setHiddenIds(new Set());
        setSyncStatus(isAuth ? "degraded" : "error");
      });
  }, []);

  const priorityIds = useMemo(() => new Set(priorityOrder), [priorityOrder]);

  const persistHidden = useCallback((ids: Set<string>) => {
    if (!USE_CLOUD) return;
    setSaveFailed(false);
    cloudPatch({ hiddenIds: Array.from(ids) }).catch(() => setSaveFailed(true));
  }, []);

  const persistPriority = useCallback((order: string[]) => {
    if (!USE_CLOUD) return;
    setSaveFailed(false);
    cloudPatch({ priorityIds: order }).catch(() => setSaveFailed(true));
  }, []);

  const hide = useCallback(
    (id: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev ?? []);
        next.add(id);
        persistHidden(next);
        return next;
      });
    },
    [persistHidden]
  );

  const unhide = useCallback(
    (id: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev ?? []);
        next.delete(id);
        persistHidden(next);
        return next;
      });
    },
    [persistHidden]
  );

  const clearHidden = useCallback(() => {
    const empty = new Set<string>();
    setHiddenIds(empty);
    persistHidden(empty);
  }, [persistHidden]);

  const togglePriority = useCallback((id: string) => {
    setPriorityOrder((prev) => {
      const newOrder = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      persistPriority(newOrder);
      return newOrder;
    });
  }, [persistPriority]);

  const reorderPriority = useCallback((newOrder: string[]) => {
    setPriorityOrder(newOrder);
    persistPriority(newOrder);
  }, [persistPriority]);

  const skipForDay = useCallback((id: string, date: string) => {
    setSkippedForDay((prev) => {
      const next = { ...prev, [date]: [...(prev[date] ?? []), id] };
      if (USE_CLOUD) {
        setSaveFailed(false);
        cloudPatch({ skippedForDay: next }).catch(() => setSaveFailed(true));
      }
      return next;
    });
  }, []);

  const restoreSkippedForDay = useCallback((date: string) => {
    setSkippedForDay((prev) => {
      const next = { ...prev };
      delete next[date];
      if (USE_CLOUD) {
        setSaveFailed(false);
        cloudPatch({ skippedForDay: next }).catch(() => setSaveFailed(true));
      }
      return next;
    });
  }, []);

  const importHiddenAndPriority = useCallback((h: string[], p: string[]) => {
    const hSet = new Set(h);
    setHiddenIds(hSet);
    setPriorityOrder(p);
    if (USE_CLOUD) {
      setSaveFailed(false);
      cloudPatch({ hiddenIds: h, priorityIds: p }).catch(() => setSaveFailed(true));
    }
  }, []);

  return {
    hiddenIds: hiddenIds ?? new Set(),
    hide,
    unhide,
    clearHidden,
    priorityIds,
    priorityOrder,
    togglePriority,
    reorderPriority,
    importHiddenAndPriority,
    skippedForDay,
    skipForDay,
    restoreSkippedForDay,
    syncStatus,
    saveFailed,
  };
}
