import { useState, useEffect, useCallback } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";

interface UseFinFavoritesResult {
  finFavoriteIds: Set<string>;
  toggleFinFavorite: (id: string) => void;
}

export function useFinFavorites(): UseFinFavoritesResult {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!USE_CLOUD) return;
    cloudFetch()
      .then((state) => setIds(new Set(state.finFavoriteIds)))
      .catch(() => {});
  }, []);

  const toggleFinFavorite = useCallback((id: string) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      cloudPatch({ finFavoriteIds: Array.from(next) }).catch(() => {});
      return next;
    });
  }, []);

  return { finFavoriteIds: ids, toggleFinFavorite };
}
