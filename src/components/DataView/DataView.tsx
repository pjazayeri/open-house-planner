import { useState } from "react";
import type { Listing, VisitRecord } from "../../types";
import { formatPrice, formatBedsBaths } from "../../utils/formatters";
import "./DataView.css";

interface DataViewProps {
  allListings: Listing[];
  hiddenIds: Set<string>;
  visits: Record<string, VisitRecord>;
  priorityIds: Set<string>;
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
  onTogglePriority: (id: string) => void;
  onMarkVisited: (id: string) => void;
  onSetLiked: (id: string, liked: boolean | null) => void;
  onSetRating: (id: string, rating: number | null) => void;
  onToggleWantOffer: (id: string) => void;
  onSetNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  onClearVisit: (id: string) => void;
  onBack: () => void;
  onOpenFinance: (id: string) => void;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtVisitTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

interface RowProps {
  listing: Listing;
  isHidden: boolean;
  isPriority: boolean;
  visit: VisitRecord | null;
  onHide: () => void;
  onUnhide: () => void;
  onTogglePriority: () => void;
  onMarkVisited: () => void;
  onSetLiked: (liked: boolean | null) => void;
  onSetRating: (rating: number | null) => void;
  onToggleWantOffer: () => void;
  onSetNoteField: (field: "pros" | "cons", value: string) => void;
  onClearVisit: () => void;
  onOpenFinance: () => void;
}

function DataRow({
  listing: l,
  isHidden,
  isPriority,
  visit,
  onHide,
  onUnhide,
  onTogglePriority,
  onMarkVisited,
  onSetLiked,
  onSetRating,
  onToggleWantOffer,
  onSetNoteField,
  onClearVisit,
  onOpenFinance,
}: RowProps) {
  const [localPros, setLocalPros] = useState(visit?.pros ?? "");
  const [localCons, setLocalCons] = useState(visit?.cons ?? "");
  const [saved, setSaved] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  // Auto-create visit record when rating or liked is set on unvisited listing
  const handleSetLiked = (liked: boolean | null) => {
    if (!visit && liked !== null) onMarkVisited();
    onSetLiked(liked);
  };
  const handleSetRating = (rating: number | null) => {
    if (!visit && rating !== null) onMarkVisited();
    onSetRating(rating);
  };

  const rowClass = [
    "dv-row",
    isHidden ? "dv-row--hidden" : "",
    visit?.liked === true ? "dv-row--liked" : "",
    visit?.liked === false ? "dv-row--disliked" : "",
    isPriority && !isHidden ? "dv-row--priority" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rowClass}>
      <div className="dv-thumb">
        {!thumbError ? (
          <img
            src={`${import.meta.env.BASE_URL}thumbnails/${l.id}.jpg`}
            alt={l.address}
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="dv-thumb-placeholder" />
        )}
      </div>

      <div className="dv-info">
        <a className="dv-address" href={l.url} target="_blank" rel="noopener noreferrer">
          {l.address}
        </a>
        <div className="dv-details">
          <span>{formatPrice(l.price)}</span>
          <span>·</span>
          <span>{formatBedsBaths(l.beds, l.baths)}</span>
          {l.sqft && <><span>·</span><span>{l.sqft.toLocaleString()} sqft</span></>}
          <span>·</span>
          <span className={`dv-cap ${l.capRate >= 3.5 ? "good" : l.capRate >= 1.5 ? "ok" : "low"}`}>
            {l.capRate.toFixed(1)}% cap
          </span>
        </div>
        <div className="dv-time">
          {fmtDate(l.openHouseStart)} · {fmtTime(l.openHouseStart)}–{fmtTime(l.openHouseEnd)}
        </div>
      </div>

      <div className="dv-controls">
        <button
          className={`dv-btn dv-priority ${isPriority ? "active" : ""}`}
          title={isPriority ? "Remove from priority" : "Mark as priority"}
          onClick={onTogglePriority}
        >
          {isPriority ? "★" : "☆"}
        </button>

        {visit ? (
          <div className="dv-visited">
            <span className="dv-visited-time">{fmtVisitTime(visit.visitedAt)}</span>
            <button className="dv-btn dv-clear" title="Clear visit" onClick={onClearVisit}>✕</button>
          </div>
        ) : (
          <button className="dv-btn dv-visit" onClick={onMarkVisited}>Visit</button>
        )}

        {/* Thumbs */}
        <div className="dv-thumbs">
          <button
            className={`dv-btn dv-thumb ${visit?.liked === true ? "active-up" : ""}`}
            title="Liked it"
            onClick={() => handleSetLiked(visit?.liked === true ? null : true)}
          >👍</button>
          <button
            className={`dv-btn dv-thumb ${visit?.liked === false ? "active-down" : ""}`}
            title="Didn't like it"
            onClick={() => handleSetLiked(visit?.liked === false ? null : false)}
          >👎</button>
        </div>

        {/* Stars — clicking without a visit auto-marks visited */}
        <div className="dv-stars" onMouseLeave={() => setHoverRating(null)}>
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = hoverRating !== null ? n <= hoverRating : visit?.rating !== null && visit?.rating !== undefined && n <= visit.rating;
            return (
              <button
                key={n}
                className={`dv-star ${filled ? "active" : ""}`}
                onMouseEnter={() => setHoverRating(n)}
                onClick={() => handleSetRating(visit?.rating === n ? null : n)}
                title={`${n} star${n > 1 ? "s" : ""}`}
              >
                {filled ? "★" : "☆"}
              </button>
            );
          })}
        </div>

        {visit && (
          <button
            className={`dv-btn dv-offer ${visit.wantOffer ? "active" : ""}`}
            title={visit.wantOffer ? "Remove offer interest" : "Want to put in an offer"}
            onClick={onToggleWantOffer}
          >
            🏠
          </button>
        )}

        <button
          className="dv-btn dv-finance"
          title="View finance breakdown"
          onClick={onOpenFinance}
        >
          $
        </button>

        <button
          className={`dv-btn dv-hide ${isHidden ? "is-hidden" : ""}`}
          title={isHidden ? "Restore listing" : "Hide listing"}
          onClick={isHidden ? onUnhide : onHide}
        >
          {isHidden ? "👁" : "✕"}
        </button>
      </div>

      <div className="dv-notes-col">
        <div className="dv-notes-grid">
          <div className="dv-notes-field">
            <label className="dv-notes-label">Pros</label>
            <textarea
              className="dv-notes"
              placeholder="What did you like?"
              value={localPros}
              rows={2}
              onChange={(e) => { setLocalPros(e.target.value); setSaved(false); }}
              onBlur={() => {
                onSetNoteField("pros", localPros);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
            />
          </div>
          <div className="dv-notes-field">
            <label className="dv-notes-label">Cons</label>
            <textarea
              className="dv-notes"
              placeholder="What didn't work?"
              value={localCons}
              rows={2}
              onChange={(e) => { setLocalCons(e.target.value); setSaved(false); }}
              onBlur={() => {
                onSetNoteField("cons", localCons);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
            />
          </div>
        </div>
        {saved && <span className="dv-saved">Saved ✓</span>}
      </div>
    </div>
  );
}

type SortKey = "time" | "price" | "capRate" | "pricePerSqft" | "visited" | "rating";
type FilterKey = "all" | "visited" | "unvisited" | "liked" | "disliked" | "rated" | "unrated" | "highRated" | "priority" | "hidden" | "wantOffer";

const SORT_LABELS: Record<SortKey, string> = {
  time: "Time",
  price: "Price",
  capRate: "Cap Rate",
  pricePerSqft: "\$/sqft",
  visited: "Visited",
  rating: "Rating",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  visited: "Visited",
  unvisited: "Not Visited",
  liked: "👍 Liked",
  disliked: "👎 Disliked",
  rated: "★ Rated",
  unrated: "No Rating",
  highRated: "4–5 ★",
  priority: "Priority",
  hidden: "Hidden",
  wantOffer: "Want to Offer",
};

export function DataView({
  allListings,
  hiddenIds,
  visits,
  priorityIds,
  onHide,
  onUnhide,
  onTogglePriority,
  onMarkVisited,
  onSetLiked,
  onSetRating,
  onToggleWantOffer,
  onSetNoteField,
  onClearVisit,
  onBack,
  onOpenFinance,
}: DataViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());

  function toggleFilter(k: FilterKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function ratingOrder(id: string): number {
    const v = visits[id];
    if (!v || v.rating === null) return 99;
    return -v.rating; // higher rating = earlier
  }

  function visitedOrder(id: string): number {
    return visits[id] ? 0 : 1;
  }

  function matchesFilter(id: string, k: FilterKey): boolean {
    const v = visits[id];
    switch (k) {
      case "visited":   return !!v;
      case "unvisited": return !v;
      case "liked":     return v?.liked === true;
      case "disliked":  return v?.liked === false;
      case "rated":     return !!v && v.rating !== null;
      case "unrated":   return !!v && v.rating === null;
      case "highRated": return !!v && v.rating !== null && v.rating >= 4;
      case "priority":  return priorityIds.has(id);
      case "hidden":    return hiddenIds.has(id);
      case "wantOffer": return visits[id]?.wantOffer === true;
      default:          return true;
    }
  }

  const filtered = allListings.filter((l) => {
    if (activeFilters.size === 0) return true;
    for (const k of activeFilters) {
      if (matchesFilter(l.id, k)) return true;
    }
    return false;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "price")   return a.price - b.price;
    if (sortKey === "capRate") return b.capRate - a.capRate;
    if (sortKey === "pricePerSqft") { const aPsf = a.sqft ? a.price / a.sqft : Infinity; const bPsf = b.sqft ? b.price / b.sqft : Infinity; return aPsf - bPsf; }
    if (sortKey === "visited") return visitedOrder(a.id) - visitedOrder(b.id);
    if (sortKey === "rating")  return ratingOrder(a.id) - ratingOrder(b.id);
    return a.openHouseStart.getTime() - b.openHouseStart.getTime();
  });

  const visitedCount  = Object.keys(visits).length;
  const ratedCount    = Object.values(visits).filter((v) => v.rating !== null).length;
  const highRatedCount = Object.values(visits).filter((v) => v.rating !== null && v.rating >= 4).length;

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const headers = [
      "Address", "Price", "Beds", "Baths", "Sqft", "Cap Rate (%)",
      "Property Type", "Open House Date", "Open House Time",
      "Priority", "Hidden", "Visited", "Visited At", "Liked", "Stars (1-5)", "Want Offer",
      "Pros", "Cons", "Redfin URL",
    ];
    const rows = allListings
      .sort((a, b) => a.openHouseStart.getTime() - b.openHouseStart.getTime())
      .map((l) => {
        const v = visits[l.id];
        const likedStr = v ? (v.liked === true ? "liked" : v.liked === false ? "disliked" : "") : "";
        const ratingStr = v?.rating != null ? String(v.rating) : "";
        return [
          esc(l.address),
          l.price,
          l.beds,
          l.baths,
          l.sqft ?? "",
          l.capRate.toFixed(2),
          esc(l.propertyType),
          esc(l.openHouseStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })),
          esc(`${fmtTime(l.openHouseStart)}–${fmtTime(l.openHouseEnd)}`),
          priorityIds.has(l.id) ? "yes" : "no",
          hiddenIds.has(l.id) ? "yes" : "no",
          v ? "yes" : "no",
          v ? esc(new Date(v.visitedAt).toLocaleString()) : "",
          esc(likedStr),
          ratingStr,
          v?.wantOffer ? "yes" : "no",
          esc(v?.pros ?? ""),
          esc(v?.cons ?? ""),
          esc(l.url),
        ].join(",");
      });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `open-house-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dv-page">
      <div className="dv-header">
        <div className="dv-header-top">
          <button className="dv-back" onClick={onBack}>← Back</button>
          <button className="dv-export" onClick={exportCsv}>Export CSV</button>
          <div className="dv-header-center">
            <h2>All Listings</h2>
            <div className="dv-stats">
              <span>{allListings.length} total</span>
              <span>·</span>
              <span>{visitedCount} visited</span>
              <span>·</span>
              <span>{ratedCount} rated</span>
              {highRatedCount > 0 && <><span>·</span><span>{highRatedCount} high-rated ★</span></>}
              {hiddenIds.size > 0 && <><span>·</span><span>{hiddenIds.size} hidden</span></>}
            </div>
          </div>
        </div>

        <div className="dv-header-bottom">
          <div className="dv-control-row">
            <span className="dv-control-label">Filter</span>
            <div className="dv-chips">
              {activeFilters.size > 0 && (
                <button
                  className="dv-chip dv-chip-clear"
                  onClick={() => setActiveFilters(new Set())}
                >
                  Clear
                </button>
              )}
              {(Object.keys(FILTER_LABELS) as FilterKey[]).filter((k) => k !== "all").map((k) => (
                <button
                  key={k}
                  className={`dv-chip ${activeFilters.has(k) ? "active" : ""}`}
                  onClick={() => toggleFilter(k)}
                >
                  {FILTER_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="dv-control-row">
            <span className="dv-control-label">Sort</span>
            <div className="dv-chips">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  className={`dv-chip ${sortKey === k ? "active" : ""}`}
                  onClick={() => setSortKey(k)}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dv-list">
        {sorted.length === 0 && (
          <div className="dv-empty">No listings match this filter.</div>
        )}
        {sorted.map((l) => (
          <DataRow
            key={l.id}
            listing={l}
            isHidden={hiddenIds.has(l.id)}
            isPriority={priorityIds.has(l.id)}
            visit={visits[l.id] ?? null}
            onHide={() => onHide(l.id)}
            onUnhide={() => onUnhide(l.id)}
            onTogglePriority={() => onTogglePriority(l.id)}
            onMarkVisited={() => onMarkVisited(l.id)}
            onSetLiked={(liked) => onSetLiked(l.id, liked)}
            onSetRating={(rating) => onSetRating(l.id, rating)}
            onToggleWantOffer={() => onToggleWantOffer(l.id)}
            onSetNoteField={(field, value) => onSetNoteField(l.id, field, value)}
            onClearVisit={() => onClearVisit(l.id)}
            onOpenFinance={() => onOpenFinance(l.id)}
          />
        ))}
      </div>
    </div>
  );
}
