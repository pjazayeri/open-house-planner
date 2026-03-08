import { useState } from "react";
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
  onToggleWantOffer: (id: string) => void;
  onSetNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  onClearVisit: (id: string) => void;
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
  onToggleWantOffer,
  onSetNoteField,
  onClearVisit,
  showOnlyPriority,
  onTogglePriorityFilter,
}: SidebarProps) {
  const visibleGroups = showOnlyPriority
    ? timeSlotGroups
        .map((g) => ({ ...g, listings: g.listings.filter((l) => priorityIds.has(l.id)) }))
        .filter((g) => g.listings.length > 0)
    : timeSlotGroups;

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
        {visibleGroups.map((group, idx) => (
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
            onToggleWantOffer={onToggleWantOffer}
            onSetNoteField={onSetNoteField}
            onClearVisit={onClearVisit}
          />
        ))}
      </div>
    </aside>
  );
}
