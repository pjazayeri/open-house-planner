import { useState, useMemo } from "react";
import type { TimeSlotGroup as TimeSlotGroupType, Listing, VisitRecord } from "../../types";
import { TimeSlotGroup } from "./TimeSlotGroup";
import { formatTimeRange } from "../../utils/formatters";
import "./Sidebar.css";

interface SidebarProps {
  timeSlotGroups: TimeSlotGroupType[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onHide: (id: string) => void;
  priorityIds: Set<string>;
  onTogglePriority: (id: string) => void;
  showOnlyPriority: boolean;
  onTogglePriorityFilter: () => void;
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

type SortKey = "time" | "price" | "capRate" | "ppsf";
type FilterKey = "liked" | "disliked" | "visited" | "unvisited" | "priority" | "rated";

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

function sortListings(listings: Listing[], key: SortKey): Listing[] {
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

function matchesFilter(id: string, key: FilterKey, visits: Record<string, VisitRecord>, priorityIds: Set<string>): boolean {
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
  priorityIds,
  timeSlotGroups,
  onSelect,
}: {
  priorityIds: Set<string>;
  timeSlotGroups: TimeSlotGroupType[];
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  const priorityListings: { listing: Listing; dayLabel: string }[] = [];
  for (const group of timeSlotGroups) {
    for (const listing of group.listings) {
      if (priorityIds.has(listing.id)) {
        const dayLabel = listing.openHouseStart.toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        priorityListings.push({ listing, dayLabel });
      }
    }
  }
  priorityListings.sort(
    (a, b) => a.listing.openHouseStart.getTime() - b.listing.openHouseStart.getTime()
  );

  if (priorityListings.length === 0) return null;

  return (
    <div className="priority-section">
      <button className="priority-header" onClick={() => setCollapsed(!collapsed)}>
        <span className="priority-star">★</span>
        <span className="priority-title">Planning to Attend ({priorityListings.length})</span>
        <span className="slot-chevron">{collapsed ? "+" : "\u2212"}</span>
      </button>
      {!collapsed && (
        <div className="priority-list">
          {priorityListings.map(({ listing, dayLabel }) => (
            <button
              key={listing.id}
              className="priority-item"
              onClick={() => onSelect(listing.id)}
            >
              <span className="priority-item-address">{listing.address}</span>
              <span className="priority-item-time">
                {dayLabel} · {formatTimeRange(listing.openHouseStart, listing.openHouseEnd)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  timeSlotGroups,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onHide,
  priorityIds,
  onTogglePriority,
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
}: SidebarProps) {
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());

  function toggleFilter(k: FilterKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  const processedGroups = useMemo(() => {
    let groups = showOnlyPriority
      ? timeSlotGroups
          .map((g) => ({ ...g, listings: g.listings.filter((l) => priorityIds.has(l.id)) }))
          .filter((g) => g.listings.length > 0)
      : timeSlotGroups;

    // Apply filters
    if (activeFilters.size > 0) {
      groups = groups
        .map((g) => ({
          ...g,
          listings: g.listings.filter((l) =>
            [...activeFilters].some((f) => matchesFilter(l.id, f, visits, priorityIds))
          ),
        }))
        .filter((g) => g.listings.length > 0);
    }

    // Apply sort within each group
    if (sortKey !== "time") {
      groups = groups.map((g) => ({ ...g, listings: sortListings(g.listings, sortKey) }));
    }

    return groups;
  }, [timeSlotGroups, showOnlyPriority, activeFilters, sortKey, visits, priorityIds]);

  const totalVisible = processedGroups.reduce((s, g) => s + g.listings.length, 0);
  const totalAll = timeSlotGroups.reduce((s, g) => s + g.listings.length, 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-content">
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

        {/* ── Filter + Sort bar ── */}
        <div className="sidebar-controls">
          <div className="sb-control-row">
            <span className="sb-control-label">Sort</span>
            <div className="sb-chips">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  className={`sb-chip ${sortKey === k ? "active" : ""}`}
                  onClick={() => setSortKey(k)}
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
                  onClick={() => setActiveFilters(new Set())}
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
              {totalVisible} of {totalAll} shown
            </div>
          )}
        </div>

        {priorityIds.size > 0 && (
          <button
            className={`priority-filter-btn ${showOnlyPriority ? "active" : ""}`}
            onClick={onTogglePriorityFilter}
          >
            ★ {showOnlyPriority ? "Showing priority only" : `Filter to priority (${priorityIds.size})`}
          </button>
        )}
        {!showOnlyPriority && (
          <PrioritySection
            priorityIds={priorityIds}
            timeSlotGroups={timeSlotGroups}
            onSelect={onSelect}
          />
        )}
        {processedGroups.map((group, idx) => (
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
        {processedGroups.length === 0 && activeFilters.size > 0 && (
          <div className="sb-empty">No listings match this filter.</div>
        )}
      </div>
    </aside>
  );
}
