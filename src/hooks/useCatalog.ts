import { useState, useCallback } from "react";
import type { Listing } from "../types";
import { apiUrl } from "../utils/apiBase";
import { getAuthHeaders } from "../utils/cloudSync";
import { catalogEntriesToRows, type CatalogResponse } from "../utils/catalog";
import { transformAll } from "../utils/filterListings";

type AuthMode = "loading" | "signed-in" | "guest" | "demo" | "signed-out";

export interface UseCatalogResult {
  /** Catalog listings with an upcoming open house (null until loaded). */
  listings: Listing[] | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  /** Load (or reload) the catalog. No-op unless signed in. */
  load: () => Promise<void>;
}

/**
 * The shared listing catalog (every SF listing with an upcoming open house,
 * from the daily Redfin ingest) for the in-app Catalog view. Loaded lazily —
 * only when the user opens the Catalog tab — and run through the same
 * transform as CSV rows so cards render identically.
 */
export function useCatalog(authMode: AuthMode): UseCatalogResult {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (authMode !== "signed-in") return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(apiUrl("/api/listings?catalog=1"), { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CatalogResponse & { updatedAt?: string | null };
      const rows = catalogEntriesToRows(data.catalog);
      const all = transformAll(rows).sort((a, b) => a.openHouseStart.getTime() - b.openHouseStart.getTime());
      setListings(all);
      setUpdatedAt(data.updatedAt ? new Date(data.updatedAt) : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [authMode]);

  return { listings, loading, error, updatedAt, load };
}
