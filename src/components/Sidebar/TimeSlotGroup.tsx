import { useState } from "react";
import type { TimeSlotGroup as TimeSlotGroupType, VisitRecord } from "../../types";
import { PropertyCard } from "./PropertyCard";
import "./Sidebar.css";

interface TimeSlotGroupProps {
  group: TimeSlotGroupType;
  slotIndex: number;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onHide: (id: string) => void;
  visits: Record<string, VisitRecord>;
  nearbyId: string | null;
  onMarkVisited: (id: string) => void;
  onSetLiked: (id: string, liked: boolean | null) => void;
  onSetNotes: (id: string, notes: string) => void;
  onClearVisit: (id: string) => void;
}

const SLOT_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function TimeSlotGroup({
  group,
  slotIndex,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onHide,
  visits,
  nearbyId,
  onMarkVisited,
  onSetLiked,
  onSetNotes,
  onClearVisit,
}: TimeSlotGroupProps) {
  const [collapsed, setCollapsed] = useState(false);
  const color = SLOT_COLORS[slotIndex % SLOT_COLORS.length];

  return (
    <div className="time-slot-group">
      <button
        className="time-slot-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="slot-color-dot" style={{ background: color }} />
        <span className="slot-label">{group.label}</span>
        <span className="slot-chevron">{collapsed ? "+" : "\u2212"}</span>
      </button>
      {!collapsed && (
        <div className="slot-listings">
          {group.listings.map((listing) => (
            <PropertyCard
              key={listing.id}
              listing={listing}
              isSelected={selectedId === listing.id}
              isHovered={hoveredId === listing.id}
              onSelect={onSelect}
              onHover={onHover}
              onHide={onHide}
              visit={visits[listing.id] ?? null}
              isNearby={nearbyId === listing.id}
              onMarkVisited={onMarkVisited}
              onSetLiked={onSetLiked}
              onSetNotes={onSetNotes}
              onClearVisit={onClearVisit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export { SLOT_COLORS };
