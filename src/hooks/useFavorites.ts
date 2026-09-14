import { useState, useCallback, useEffect } from "react";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";

type AuthMode = "loading" | "signed-in" | "guest" | "demo" | "signed-out";

export interface UseFavoritesResult {
  /** Normalized address keys the user hearted in the Catalog view. */
  favoriteIds: Set<string>;
  isFavorite: (addressKey: string) => boolean;
  toggleFavorite: (addressKey: string) => void;
  saveFailed: boolean;
}

/** Pure toggle so the persistence path and the UI share one definition. */
export function toggleKey(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key); else next.add(key);
  return next;
}

/**
 * Catalog favorites ("♥" on a shared-catalog listing) — the user's own
 * "my listings" universe, independent of any Redfin CSV export. Persisted in
 * user_state.favoriteIds via cloudPatch (same pattern as useHiddenIds);
 * guest/demo keep it in memory only.
 */
export function useFavorites(authMode: AuthMode = "signed-in"): UseFavoritesResult {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (authMode === "loading" || authMode === "signed-out") return;
    if (!USE_CLOUD || authMode === "guest" || authMode === "demo") return;
    cloudFetch()
      .then((state) => setFavoriteIds(new Set(state.favoriteIds)))
      .catch((err: unknown) => console.error("[useFavorites] cloud fetch failed:", err));
  }, [authMode]);

  const toggleFavorite = useCallback((addressKey: string) => {
    setFavoriteIds((prev) => {
      const next = toggleKey(prev, addressKey);
      if (USE_CLOUD && authMode === "signed-in") {
        setSaveFailed(false);
        cloudPatch({ favoriteIds: Array.from(next) }).catch(() => setSaveFailed(true));
      }
      return next;
    });
  }, [authMode]);

  const isFavorite = useCallback((k: string) => favoriteIds.has(k), [favoriteIds]);

  return { favoriteIds, isFavorite, toggleFavorite, saveFailed };
}
