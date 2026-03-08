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
  onSetNotes: (id: string, notes: string) => void;
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
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
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
  onSetNotes: (notes: string) => void;
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
  onSetNotes,
  onClearVisit,
}: RowProps) {
  const [localNotes, setLocalNotes] = useState(visit?.notes ?? "");
  const [saved, setSaved] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const rowClass = [
    "dv-row",
    isHidden ? "dv-row--hidden" : "",
    visit?.liked === true ? "dv-row--liked" : "",
    visit?.liked === false ? "dv-row--disliked" : "",
    isPriority && !isHidden ? "dv-row--priority" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rowClass}>
      {/* Thumbnail */}
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

      {/* Address + details */}
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

      {/* Controls */}
      <div className="dv-controls">
        {/* Priority */}
        <button
          className={`dv-btn dv-priority ${isPriority ? "active" : ""}`}
          title={isPriority ? "Remove from priority" : "Mark as priority"}
          onClick={onTogglePriority}
        >
          {isPriority ? "★" : "☆"}
        </button>

        {/* Visit */}
        {visit ? (
          <div className="dv-visited">
            <span className="dv-visited-time">{fmtVisitTime(visit.visitedAt)}</span>
            <button className="dv-btn dv-clear" title="Clear visit" onClick={onClearVisit}>✕</button>
          </div>
        ) : (
          <button className="dv-btn dv-visit" onClick={onMarkVisited}>
            Visit
          </button>
        )}

        {/* Rating */}
        {visit && (
          <div className="dv-rating">
            <button
              className={`dv-btn dv-thumb ${visit.liked === true ? "active-up" : ""}`}
              onClick={() => onSetLiked(visit.liked === true ? null : true)}
            >👍</button>
            <button
              className={`dv-btn dv-thumb ${visit.liked === false ? "active-down" : ""}`}
              onClick={() => onSetLiked(visit.liked === false ? null : false)}
            >👎</button>
          </div>
        )}

        {/* Hide/unhide */}
        <button
          className={`dv-btn dv-hide ${isHidden ? "is-hidden" : ""}`}
          title={isHidden ? "Restore listing" : "Hide listing"}
          onClick={isHidden ? onUnhide : onHide}
        >
          {isHidden ? "👁" : "✕"}
        </button>
      </div>

      {/* Notes */}
      <div className="dv-notes-col">
        <textarea
          className="dv-notes"
          placeholder="Notes…"
          value={localNotes}
          rows={2}
          onChange={(e) => { setLocalNotes(e.target.value); setSaved(false); }}
          onBlur={() => {
            onSetNotes(localNotes);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
          }}
        />
        {saved && <span className="dv-saved">Saved ✓</span>}
      </div>
    </div>
  );
}

type SortKey = "time" | "price" | "capRate";

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
  onSetNotes,
  onClearVisit,
  onBack,
}: DataViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [showHidden, setShowHidden] = useState(true);

  const sorted = [...allListings]
    .filter((l) => showHidden || !hiddenIds.has(l.id))
    .sort((a, b) => {
      if (sortKey === "price") return a.price - b.price;
      if (sortKey === "capRate") return b.capRate - a.capRate;
      return a.openHouseStart.getTime() - b.openHouseStart.getTime();
    });

  const visitedCount = Object.keys(visits).length;
  const likedCount = Object.values(visits).filter((v) => v.liked === true).length;
  const dislikedCount = Object.values(visits).filter((v) => v.liked === false).length;

  return (
    <div className="dv-page">
      <div className="dv-header">
        <button className="dv-back" onClick={onBack}>← Back</button>
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
        <div className="dv-header-controls">
          <label className="dv-toggle">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
            />
            Show hidden
          </label>
          <div className="dv-sort">
            <span>Sort:</span>
            {(["time", "price", "capRate"] as SortKey[]).map((k) => (
              <button
                key={k}
                className={`dv-sort-btn ${sortKey === k ? "active" : ""}`}
                onClick={() => setSortKey(k)}
              >
                {k === "time" ? "Time" : k === "price" ? "Price" : "Cap Rate"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dv-list">
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
            onSetNotes={(notes) => onSetNotes(l.id, notes)}
            onClearVisit={() => onClearVisit(l.id)}
          />
        ))}
      </div>
    </div>
  );
}
