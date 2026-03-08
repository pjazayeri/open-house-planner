import { useState, useMemo } from "react";
import type { TimeSlotGroup as TimeSlotGroupType, Listing, VisitRecord } from "../../types";
import { TimeSlotGroup } from "./TimeSlotGroup";
import { formatTimeRange } from "../../utils/formatters";
import "./Sidebar.css";

interface SidebarProps {
  mode: "browse" | "planner";
  timeSlotGroups: TimeSlotGroupType[];
  totalListings: number;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onHide: (id: string) => void;
  priorityIds: Set<string>;
  priorityOrder: string[];
  onTogglePriority: (id: string) => void;
  onReorderPriority: (newOrder: string[]) => void;
  showOnlyPriority: boolean;
  onTogglePriorityFilter: () => void;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  activeFilters: Set<FilterKey>;
  onFiltersChange: (filters: Set<FilterKey>) => void;
  visits: Record<string, VisitRecord>;
  nearbyId: string | null;
  geoWatching: boolean;
  geoError: string | null;
  onStartGeo: () => void;
  onMarkVisited: (id: string) => void;
  onSetLiked: (id: string, liked: boolean | null) => void;
  onSetRating: (id: string, rating: number | null) => void;
  onToggleWantOffer: (id: string) => void;
  onSetNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  onClearVisit: (id: string) => void;
  onOpenFinance: (id: string) => void;
}

export type SortKey = "time" | "price" | "capRate" | "ppsf";
export type FilterKey = "liked" | "disliked" | "visited" | "unvisited" | "priority" | "rated";

const SORT_LABELS: Record<SortKey, string> = {
  time: "Time",
  price: "Price",
  capRate: "Cap Rate",
  ppsf: "$/sqft",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  liked: "👍 Liked",
  disliked: "👎 Disliked",
  visited: "Visited",
  unvisited: "Unvisited",
  rated: "★ Rated",
  priority: "⭐ Priority",
};

export function sortListings(listings: Listing[], key: SortKey): Listing[] {
  if (key === "time") return listings; // already in visit order
  return [...listings].sort((a, b) => {
    if (key === "price") return a.price - b.price;
    if (key === "capRate") return b.capRate - a.capRate;
    if (key === "ppsf") {
      const pa = a.pricePerSqft ?? Infinity;
      const pb = b.pricePerSqft ?? Infinity;
      return pa - pb;
    }
    return 0;
  });
}

export function matchesFilter(id: string, key: FilterKey, visits: Record<string, VisitRecord>, priorityIds: Set<string>): boolean {
  const v = visits[id];
  switch (key) {
    case "liked":    return v?.liked === true;
    case "disliked": return v?.liked === false;
    case "visited":  return !!v;
    case "unvisited": return !v;
    case "rated":    return !!v && v.rating !== null;
    case "priority": return priorityIds.has(id);
  }
}

function PrioritySection({
  priorityOrder,
  timeSlotGroups,
  onSelect,
  onTogglePriority,
  onReorderPriority,
}: {
  priorityOrder: string[];
  timeSlotGroups: TimeSlotGroupType[];
  onSelect: (id: string) => void;
  onTogglePriority: (id: string) => void;
  onReorderPriority: (newOrder: string[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const listingMap = useMemo(() => {
    const map = new Map<string, Listing>();
    for (const group of timeSlotGroups) {
      for (const listing of group.listings) {
        map.set(listing.id, listing);
      }
    }
    return map;
  }, [timeSlotGroups]);

  const priorityListings = useMemo(() =>
    priorityOrder
      .filter((id) => listingMap.has(id))
      .map((id) => {
        const listing = listingMap.get(id)!;
        const dayLabel = listing.openHouseStart.toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        return { listing, dayLabel };
      }),
    [priorityOrder, listingMap]
  );

  if (priorityListings.length === 0) return null;

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }

  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const filtered = priorityOrder.filter((id) => listingMap.has(id));
    const newOrder = [...filtered];
    const [moved] = newOrder.splice(dragIdx, 1);
    newOrder.splice(targetIdx, 0, moved);
    // Keep IDs not in listingMap at the end (they still exist in cloud)
    const extras = priorityOrder.filter((id) => !listingMap.has(id));
    onReorderPriority([...newOrder, ...extras]);
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  return (
    <div className="priority-section">
      <button className="priority-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="priority-star">★</span>
        <span className="priority-title">Planning to Attend ({priorityListings.length})</span>
        <span className="slot-chevron">{collapsed ? "+" : "\u2212"}</span>
      </button>
      {!collapsed && (
        <div className="priority-list">
          {priorityListings.map(({ listing, dayLabel }, idx) => (
            <div
              key={listing.id}
              className={`priority-item${dragIdx === idx ? " priority-item--dragging" : ""}${dragOverIdx === idx && dragIdx !== idx ? " priority-item--drag-over" : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
            >
              <span className="priority-item-drag" title="Drag to reorder">⠿</span>
              <span className="priority-item-num">{idx + 1}</span>
              <button
                className="priority-item-main"
                onClick={() => onSelect(listing.id)}
              >
                <span className="priority-item-address">{listing.address}</span>
                <span className="priority-item-time">
                  {dayLabel} · {formatTimeRange(listing.openHouseStart, listing.openHouseEnd)}
                </span>
              </button>
              <button
                className="priority-item-remove"
                onClick={() => onTogglePriority(listing.id)}
                title="Remove from priority"
              >★</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  mode,
  timeSlotGroups,
  totalListings,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onHide,
  priorityIds,
  priorityOrder,
  onTogglePriority,
  onReorderPriority,
  visits,
  nearbyId,
  geoWatching,
  geoError,
  onStartGeo,
  onMarkVisited,
  onSetLiked,
  onSetRating,
  onToggleWantOffer,
  onSetNoteField,
  onClearVisit,
  onOpenFinance,
  showOnlyPriority,
  onTogglePriorityFilter,
  sortKey,
  onSortChange,
  activeFilters,
  onFiltersChange,
}: SidebarProps) {
  function toggleFilter(k: FilterKey) {
    const next = new Set(activeFilters);
    if (next.has(k)) next.delete(k); else next.add(k);
    onFiltersChange(next);
  }

  const totalVisible = timeSlotGroups.reduce((s, g) => s + g.listings.length, 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-content">
        {mode === "planner" && (
          <div className="sidebar-geo-bar">
            {!geoWatching ? (
              <button className="geo-btn" onClick={onStartGeo}>
                📍 Use my location
              </button>
            ) : nearbyId ? (
              <span className="geo-status nearby">📍 You're at a property!</span>
            ) : (
              <span className="geo-status active">📍 Tracking location…</span>
            )}
            {geoError && <span className="geo-error">{geoError}</span>}
          </div>
        )}

        {/* ── Filter + Sort bar ── */}
        <div className="sidebar-controls">
          <div className="sb-control-row">
            <span className="sb-control-label">Sort</span>
            <div className="sb-chips">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  className={`sb-chip ${sortKey === k ? "active" : ""}`}
                  onClick={() => onSortChange(k)}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="sb-control-row">
            <span className="sb-control-label">Filter</span>
            <div className="sb-chips">
              {activeFilters.size > 0 && (
                <button
                  className="sb-chip sb-chip-clear"
                  onClick={() => onFiltersChange(new Set())}
                >
                  Clear
                </button>
              )}
              {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => (
                <button
                  key={k}
                  className={`sb-chip ${activeFilters.has(k) ? "active" : ""}`}
                  onClick={() => toggleFilter(k)}
                >
                  {FILTER_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          {(activeFilters.size > 0 || sortKey !== "time") && (
            <div className="sb-count">
              {totalVisible} of {totalListings} shown
            </div>
          )}
        </div>

        {mode === "planner" && priorityIds.size > 0 && (
          <button
            className={`priority-filter-btn ${showOnlyPriority ? "active" : ""}`}
            onClick={onTogglePriorityFilter}
          >
            ★ {showOnlyPriority ? "Showing priority only" : `Filter to priority (${priorityIds.size})`}
          </button>
        )}
        {mode === "planner" && (
          <PrioritySection
            priorityOrder={priorityOrder}
            timeSlotGroups={timeSlotGroups}
            onSelect={onSelect}
            onTogglePriority={onTogglePriority}
            onReorderPriority={onReorderPriority}
          />
        )}
        {timeSlotGroups.map((group, idx) => (
          <TimeSlotGroup
            key={group.label}
            group={group}
            slotIndex={idx}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={onHover}
            onHide={onHide}
            priorityIds={priorityIds}
            onTogglePriority={onTogglePriority}
            visits={visits}
            nearbyId={nearbyId}
            onMarkVisited={onMarkVisited}
            onSetLiked={onSetLiked}
            onSetRating={onSetRating}
            onToggleWantOffer={onToggleWantOffer}
            onSetNoteField={onSetNoteField}
            onClearVisit={onClearVisit}
            onOpenFinance={onOpenFinance}
          />
        ))}
        {timeSlotGroups.length === 0 && activeFilters.size > 0 && (
          <div className="sb-empty">No listings match this filter.</div>
        )}
      </div>
    </aside>
  );
}
