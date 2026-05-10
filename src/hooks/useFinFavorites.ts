import { useState, useEffect, useCallback } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";
import type { AuthMode } from "./useAuth";

interface UseFinFavoritesResult {
  finFavoriteIds: Set<string>;
  toggleFinFavorite: (id: string) => void;
}

export function useFinFavorites(authMode: AuthMode): UseFinFavoritesResult {
  const [ids, setIds] = useState<Set<string>>(new Set());
  // Same race-condition pattern as useMapZones: previously this hook
  // fetched on mount with [] deps, before useAuth had set the token/binId
  // in cloudSync. The fetch threw authError, the silent catch left `ids`
  // empty, and the next toggle clobbered the cloud's real favorites with
  // a one-item Set. The Favorites filter on Finance then appeared to do
  // nothing because finFavoriteIds didn't match what the user had starred.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (authMode === "loading" || authMode === "signed-out") return;
    if (!USE_CLOUD || authMode === "guest") {
      setIds(new Set());
      setLoaded(true);
      return;
    }
    cloudFetch()
      .then((state) => {
        setIds(new Set(state.finFavoriteIds));
        setLoaded(true);
      })
      .catch((err) => {
        console.error("[useFinFavorites] cloud fetch failed:", err);
        // Leave loaded=false so toggle() refuses to write until we
        // successfully read the cloud copy — protects existing favorites.
      });
  }, [authMode]);

  const toggleFinFavorite = useCallback((id: string) => {
    if (!loaded) return; // protect cloud state from clobber
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      cloudPatch({ finFavoriteIds: Array.from(next) }).catch(() => {});
      return next;
    });
  }, [loaded]);

  return { finFavoriteIds: ids, toggleFinFavorite };
}
