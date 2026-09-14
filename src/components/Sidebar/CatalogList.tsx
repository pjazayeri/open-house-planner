import { useEffect, useMemo, useState } from "react";
import type { Listing } from "../../types";
import { formatPrice, formatTimeRange } from "../../utils/formatters";
import { thumbnailUrl } from "../../utils/thumbnailUrl";
import { listingAddressKey, timeAgo } from "../../utils/catalog";
import { matchesListingSearch } from "../../utils/listingSearch";

export interface CatalogListProps {
  signedIn: boolean;
  listings: Listing[] | null;
  loading: boolean;
  error: string | null;
  updatedAt: Date | null;
  onLoad: () => void;
  /** Address keys already in the user's CSV favorites — shown as "in my list". */
  userAddressKeys: Set<string>;
  favoriteIds: Set<string>;
  onToggleFavorite: (addressKey: string) => void;
  onSelect?: (id: string) => void;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/**
 * Browse → Catalog: every listing in the shared catalog with an upcoming open
 * house, with a ♥ to add it to the user's own list — no Redfin CSV needed.
 */
export function CatalogList({
  signedIn, listings, loading, error, updatedAt, onLoad,
  userAddressKeys, favoriteIds, onToggleFavorite, onSelect,
}: CatalogListProps) {
  const [query, setQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  useEffect(() => {
    if (signedIn && listings === null && !loading && !error) onLoad();
  }, [signedIn, listings, loading, error, onLoad]);

  const visible = useMemo(() => {
    if (!listings) return [];
    return listings.filter((l) => {
      if (onlyFavorites && !favoriteIds.has(listingAddressKey(l))) return false;
      return matchesListingSearch(l, query);
    });
  }, [listings, query, onlyFavorites, favoriteIds]);

  if (!signedIn) {
    return (
      <div className="catalog-empty">
        <p><strong>Sign in to browse the catalog.</strong></p>
        <p>Every San Francisco listing with an upcoming open house, refreshed daily — heart the ones you want on your tour.</p>
      </div>
    );
  }

  return (
    <div className="catalog">
      <div className="catalog-toolbar">
        <input
          className="sb-search-input catalog-search"
          type="search"
          placeholder="Search catalog: address, neighborhood, zip…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search catalog"
        />
        <div className="catalog-meta">
          <span>
            {listings ? `${visible.length} of ${listings.length} with open houses` : loading ? "Loading catalog…" : ""}
            {updatedAt && listings ? ` · updated ${timeAgo(updatedAt)}` : ""}
          </span>
          <button
            className={`catalog-chip${onlyFavorites ? " active" : ""}`}
            onClick={() => setOnlyFavorites((v) => !v)}
            aria-pressed={onlyFavorites}
          >
            ♥ {favoriteIds.size}
          </button>
        </div>
      </div>

      {error && (
        <div className="catalog-empty">
          <p>Couldn't load the catalog ({error}).</p>
          <button className="catalog-retry" onClick={onLoad}>Try again</button>
        </div>
      )}
      {loading && !listings && <div className="sb-empty">Loading catalog…</div>}
      {listings && visible.length === 0 && (
        <div className="sb-empty">{onlyFavorites ? "No hearted listings yet." : "No catalog listings match."}</div>
      )}

      {visible.map((l) => {
        const key = listingAddressKey(l);
        const fav = favoriteIds.has(key);
        const mine = userAddressKeys.has(key);
        return (
          <article key={l.id} className={`catalog-card${fav ? " catalog-card--fav" : ""}`} onClick={() => onSelect?.(l.id)}>
            <img
              className="catalog-thumb"
              src={thumbnailUrl(l.id, l.url)}
              alt=""
              loading="lazy"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
            />
            <div className="catalog-body">
              <div className="catalog-row">
                <span className="catalog-price">{formatPrice(l.price)}</span>
                {l.capRate > 0 && <span className="catalog-cap">{l.capRate.toFixed(1)}% cap</span>}
              </div>
              <div className="catalog-address">{l.address}</div>
              <div className="catalog-meta-line">
                {l.beds} bd / {l.baths} ba{l.sqft ? ` · ${l.sqft.toLocaleString()} sqft` : ""}{l.location ? ` · ${l.location}` : ""}
              </div>
              <div className="catalog-oh">
                {dayLabel(l.openHouseStart)} · {formatTimeRange(l.openHouseStart, l.openHouseEnd)}
                {mine && <span className="catalog-mine"> · in my list</span>}
              </div>
            </div>
            <button
              className={`catalog-heart${fav ? " on" : ""}`}
              onClick={(e) => { e.stopPropagation(); onToggleFavorite(key); }}
              aria-pressed={fav}
              aria-label={fav ? "Remove from my listings" : "Add to my listings"}
              title={fav ? "Remove from my listings" : "Add to my listings"}
            >
              {fav ? "♥" : "♡"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
