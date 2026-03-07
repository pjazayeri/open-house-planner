import { useState, useCallback, useEffect } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { SyncStatus } from "../utils/cloudSync";

interface UseHiddenIdsResult {
  hiddenIds: Set<string>;
  hide: (id: string) => void;
  clearHidden: () => void;
  syncStatus: SyncStatus;
  saveFailed: boolean;
}

export function useHiddenIds(): UseHiddenIdsResult {
  const [hiddenIds, setHiddenIds] = useState<Set<string> | null>(null);
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
        setSyncStatus("ok");
      })
      .catch(() => {
        setSyncStatus("error");
      });
  }, []);

  const persist = useCallback((ids: Set<string>) => {
    if (!USE_CLOUD) return;
    setSaveFailed(false);
    cloudPatch({ hiddenIds: Array.from(ids) }).catch(() => setSaveFailed(true));
  }, []);

  const hide = useCallback(
    (id: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev ?? []);
        next.add(id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearHidden = useCallback(() => {
    const empty = new Set<string>();
    setHiddenIds(empty);
    persist(empty);
  }, [persist]);

  return { hiddenIds: hiddenIds ?? new Set(), hide, clearHidden, syncStatus, saveFailed };
}
