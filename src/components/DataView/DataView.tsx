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
  onSetNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  onClearVisit: (id: string) => void;
  onBack: () => void;
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
  onSetNoteField: (field: "pros" | "cons", value: string) => void;
  onClearVisit: () => void;
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
  onSetNoteField,
  onClearVisit,
}: RowProps) {
  const [localPros, setLocalPros] = useState(visit?.pros ?? "");
  const [localCons, setLocalCons] = useState(visit?.cons ?? "");
  const [saved, setSaved] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  // If rating is set without an existing visit, auto-create one first
  const handleSetLiked = (liked: boolean | null) => {
    if (!visit && liked !== null) onMarkVisited();
    onSetLiked(liked);
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

        {/* Rating always visible — clicking without a visit auto-marks visited */}
        <div className="dv-rating">
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

type SortKey = "time" | "price" | "capRate" | "visited" | "liked";
type FilterKey = "all" | "visited" | "unvisited" | "liked" | "disliked" | "neutral" | "priority" | "hidden";

const SORT_LABELS: Record<SortKey, string> = {
  time: "Time",
  price: "Price",
  capRate: "Cap Rate",
  visited: "Visited",
  liked: "Liked",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  visited: "Visited",
  unvisited: "Not Visited",
  liked: "Liked",
  disliked: "Disliked",
  neutral: "No Rating",
  priority: "Priority",
  hidden: "Hidden",
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
  onSetNoteField,
  onClearVisit,
  onBack,
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

  function likedOrder(id: string): number {
    const v = visits[id];
    if (!v) return 3;
    if (v.liked === true) return 0;
    if (v.liked === null) return 1;
    return 2;
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
      case "neutral":   return !!v && v.liked === null;
      case "priority":  return priorityIds.has(id);
      case "hidden":    return hiddenIds.has(id);
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
    if (sortKey === "visited") return visitedOrder(a.id) - visitedOrder(b.id);
    if (sortKey === "liked")   return likedOrder(a.id) - likedOrder(b.id);
    return a.openHouseStart.getTime() - b.openHouseStart.getTime();
  });

  const visitedCount  = Object.keys(visits).length;
  const likedCount    = Object.values(visits).filter((v) => v.liked === true).length;
  const dislikedCount = Object.values(visits).filter((v) => v.liked === false).length;

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const headers = [
      "Address", "Price", "Beds", "Baths", "Sqft", "Cap Rate (%)",
      "Property Type", "Open House Date", "Open House Time",
      "Priority", "Hidden", "Visited", "Visited At", "Rating",
      "Pros", "Cons", "Redfin URL",
    ];
    const rows = allListings
      .sort((a, b) => a.openHouseStart.getTime() - b.openHouseStart.getTime())
      .map((l) => {
        const v = visits[l.id];
        const rating = v ? (v.liked === true ? "liked" : v.liked === false ? "disliked" : "neutral") : "";
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
          esc(rating),
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
              <span>{likedCount} liked</span>
              {dislikedCount > 0 && <><span>·</span><span>{dislikedCount} disliked</span></>}
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
            onSetNoteField={(field, value) => onSetNoteField(l.id, field, value)}
            onClearVisit={() => onClearVisit(l.id)}
          />
        ))}
      </div>
    </div>
  );
}
