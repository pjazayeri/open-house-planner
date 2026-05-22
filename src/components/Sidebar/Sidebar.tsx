import { useState, useMemo } from "react";
import type { TimeSlotGroup as TimeSlotGroupType, Listing, VisitRecord, MapZone } from "../../types";
import type { ListingAmenities } from "../../utils/cloudSync";
import { TimeSlotGroup } from "./TimeSlotGroup";
import { formatPrice, formatTimeRange } from "../../utils/formatters";
import { thumbnailUrl } from "../../utils/thumbnailUrl";
import { FilterPane } from "./filters/FilterPane";
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
  onSkipForDay: (id: string) => void;
  skippedTodayCount: number;
  onRestoreSkipped: () => void;
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
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedAreas: Set<string>;
  onAreaChange: (area: string) => void;
  availableDates: { key: string; label: string }[];
  selectedDate: string;
  onDateChange: (d: string) => void;
  priceMin: number | null;
  priceMax: number | null;
  onPriceMinChange: (v: number | null) => void;
  onPriceMaxChange: (v: number | null) => void;
  capRateMin: number | null;
  capRateMax: number | null;
  onCapRateMinChange: (v: number | null) => void;
  onCapRateMaxChange: (v: number | null) => void;
  ppsfMin: number | null;
  ppsfMax: number | null;
  onPpsfMinChange: (v: number | null) => void;
  onPpsfMaxChange: (v: number | null) => void;
  timeFrom: number | null;
  timeTo: number | null;
  onTimeFromChange: (h: number | null) => void;
  onTimeToChange: (h: number | null) => void;
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
  amenities: Record<string, ListingAmenities>;
  onSetAmenity: (id: string, field: "parking" | "laundry", value: boolean | undefined) => void;
  zones: MapZone[];
  // Status filter (Browse mode only)
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  statusCounts: Record<string, number>;
}

export type SortKey = "time" | "price" | "capRate" | "ppsf";
export type FilterKey = "liked" | "disliked" | "visited" | "unvisited" | "priority" | "notPriority" | "rated";

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
    case "notPriority": return !priorityIds.has(id);
  }
}

export function PrioritySection({
  priorityOrder,
  timeSlotGroups,
  initialCollapsed,
  hoveredId,
  onSelect,
  onHover,
  onTogglePriority,
  onReorderPriority,
}: {
  priorityOrder: string[];
  timeSlotGroups: TimeSlotGroupType[];
  initialCollapsed: boolean;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onTogglePriority: (id: string) => void;
  onReorderPriority: (newOrder: string[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
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

  function sortByTime() {
    const sorted = [...priorityListings]
      .sort((a, b) => a.listing.openHouseStart.getTime() - b.listing.openHouseStart.getTime())
      .map(({ listing }) => listing.id);
    const extras = priorityOrder.filter((id) => !listingMap.has(id));
    onReorderPriority([...sorted, ...extras]);
  }

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
      <div className="priority-header-row">
        <button className="priority-header" onClick={() => setCollapsed(!collapsed)}>
          <span className="priority-star">★</span>
          <span className="priority-title">Planning to Attend ({priorityListings.length})</span>
          <span className="slot-chevron">{collapsed ? "+" : "\u2212"}</span>
        </button>
        <button
          className="priority-sort-btn"
          onClick={sortByTime}
          title="Sort by open house time"
        >⏱ By time</button>
      </div>
      {!collapsed && (
        <div className="priority-list">
          {priorityListings.map(({ listing, dayLabel }, idx) => {
            const isHovered = hoveredId === listing.id;
            return (
              <div
                key={listing.id}
                data-testid={`priority-item-${listing.id}`}
                className={
                  `priority-item` +
                  (dragIdx === idx ? " priority-item--dragging" : "") +
                  (dragOverIdx === idx && dragIdx !== idx ? " priority-item--drag-over" : "") +
                  (isHovered ? " priority-item--hovered" : "")
                }
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onMouseEnter={() => onHover(listing.id)}
                onMouseLeave={() => onHover(null)}
              >
                <span className="priority-item-drag" title="Drag to reorder">⠿</span>
                <span className="priority-item-num">{idx + 1}</span>
                <img
                  className="priority-item-thumb"
                  src={thumbnailUrl(listing.id, listing.url)}
                  alt=""
                  loading="lazy"
                  data-testid={`priority-thumb-${listing.id}`}
                />
                <button
                  className="priority-item-main"
                  onClick={() => onSelect(listing.id)}
                >
                  <span className="priority-item-address">{listing.address}</span>
                  <span className="priority-item-meta">
                    <span className="priority-item-price">{formatPrice(listing.price)}</span>
                    {listing.sqft ? (
                      <span className="priority-item-sqft">{listing.sqft.toLocaleString()} sqft</span>
                    ) : null}
                    {listing.pricePerSqft ? (
                      <span className="priority-item-ppsf">${Math.round(listing.pricePerSqft).toLocaleString()}/sqft</span>
                    ) : null}
                  </span>
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
            );
          })}
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
  onSkipForDay,
  skippedTodayCount,
  onRestoreSkipped,
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
  amenities,
  onSetAmenity,
  showOnlyPriority,
  onTogglePriorityFilter,
  sortKey,
  onSortChange,
  activeFilters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  selectedAreas,
  onAreaChange,
  availableDates,
  selectedDate,
  onDateChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  capRateMin,
  capRateMax,
  onCapRateMinChange,
  onCapRateMaxChange,
  ppsfMin,
  ppsfMax,
  onPpsfMinChange,
  onPpsfMaxChange,
  timeFrom,
  timeTo,
  onTimeFromChange,
  onTimeToChange,
  zones,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
}: SidebarProps) {
  const totalVisible = timeSlotGroups.reduce((s, g) => s + g.listings.length, 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-content">
        {mode === "planner" && availableDates.length > 0 && (
          <div className="sb-day-banner">
            {selectedDate ? (
              <div className="sb-day-selected">
                <span className="sb-day-label">
                  📅 Planning: <strong>{availableDates.find(d => d.key === selectedDate)?.label ?? selectedDate}</strong>
                </span>
                <div className="sb-day-actions">
                  {skippedTodayCount > 0 && (
                    <button className="sb-day-restore" onClick={onRestoreSkipped} title="Restore listings hidden for today">
                      +{skippedTodayCount} hidden · restore
                    </button>
                  )}
                  <button className="sb-day-clear" onClick={() => onDateChange("")} title="Clear day filter">✕</button>
                </div>
              </div>
            ) : (
              <div className="sb-day-pick">
                <span className="sb-day-pick-label">Plan a day:</span>
                <div className="sb-chips">
                  {availableDates.map((d) => (
                    <button key={d.key} className="sb-chip" onClick={() => onDateChange(d.key)}>{d.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

        {/* ── Filter + Sort pane ───────────────────────────
         * Primary controls (search, Area, Status, Sort) are
         * always visible. Advanced controls (Time window,
         * Price/Cap Rate/$ per sqft ranges, reaction/visit/tag
         * chips) live behind "More filters ▾" so the pane
         * doesn't dominate the sidebar.
         */}
        <FilterPane
          mode={mode}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          zones={zones}
          selectedAreas={selectedAreas}
          onAreaChange={onAreaChange}
          statusFilter={statusFilter}
          statusCounts={statusCounts}
          onStatusFilterChange={onStatusFilterChange}
          sortKey={sortKey}
          onSortChange={onSortChange}
          activeFilters={activeFilters}
          onFiltersChange={onFiltersChange}
          priceMin={priceMin}
          priceMax={priceMax}
          onPriceMinChange={onPriceMinChange}
          onPriceMaxChange={onPriceMaxChange}
          capRateMin={capRateMin}
          capRateMax={capRateMax}
          onCapRateMinChange={onCapRateMinChange}
          onCapRateMaxChange={onCapRateMaxChange}
          ppsfMin={ppsfMin}
          ppsfMax={ppsfMax}
          onPpsfMinChange={onPpsfMinChange}
          onPpsfMaxChange={onPpsfMaxChange}
          timeFrom={timeFrom}
          timeTo={timeTo}
          onTimeFromChange={onTimeFromChange}
          onTimeToChange={onTimeToChange}
          selectedDate={selectedDate}
          totalVisible={totalVisible}
          totalListings={totalListings}
        />

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
            initialCollapsed={showOnlyPriority}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={onHover}
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
            onSkipForDay={selectedDate ? onSkipForDay : undefined}
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
            amenities={amenities}
            onSetAmenity={onSetAmenity}
          />
        ))}
        {timeSlotGroups.length === 0 && (activeFilters.size > 0 || searchQuery.trim()) && (
          <div className="sb-empty">No listings match.</div>
        )}
      </div>
    </aside>
  );
}
