import { useState, useCallback, useEffect } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";

const LS_KEY = "open-house-hidden-ids";

function lsLoad(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function lsSave(ids: Set<string>) {
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(ids)));
}

interface UseHiddenIdsResult {
  hiddenIds: Set<string>;
  hide: (id: string) => void;
  clearHidden: () => void;
}

export function useHiddenIds(): UseHiddenIdsResult {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(lsLoad);

  // On mount, pull latest from cloud (overrides local cache)
  useEffect(() => {
    if (!USE_CLOUD) return;
    cloudFetch()
      .then((state) => {
        const ids = new Set(state.hiddenIds);
        setHiddenIds(ids);
        lsSave(ids);
      })
      .catch(() => {
        // Network failure — stay with localStorage values silently
      });
  }, []);

  const persist = useCallback((ids: Set<string>) => {
    lsSave(ids);
    if (USE_CLOUD) {
      // cloudPatch does GET-then-PUT, so visits are preserved
      cloudPatch({ hiddenIds: Array.from(ids) }).catch(() => {});
    }
  }, []);

  const hide = useCallback(
    (id: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
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

  return { hiddenIds, hide, clearHidden };
}
