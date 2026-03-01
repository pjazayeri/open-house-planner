import type { TimeSlotGroup as TimeSlotGroupType, VisitRecord } from "../../types";
import { TimeSlotGroup } from "./TimeSlotGroup";
import "./Sidebar.css";

interface SidebarProps {
  timeSlotGroups: TimeSlotGroupType[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onHide: (id: string) => void;
  visits: Record<string, VisitRecord>;
  nearbyId: string | null;
  geoWatching: boolean;
  geoError: string | null;
  onStartGeo: () => void;
  onMarkVisited: (id: string) => void;
  onSetLiked: (id: string, liked: boolean | null) => void;
  onSetNotes: (id: string, notes: string) => void;
  onClearVisit: (id: string) => void;
}

export function Sidebar({
  timeSlotGroups,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onHide,
  visits,
  nearbyId,
  geoWatching,
  geoError,
  onStartGeo,
  onMarkVisited,
  onSetLiked,
  onSetNotes,
  onClearVisit,
}: SidebarProps) {
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
            visits={visits}
            nearbyId={nearbyId}
            onMarkVisited={onMarkVisited}
            onSetLiked={onSetLiked}
            onSetNotes={onSetNotes}
            onClearVisit={onClearVisit}
          />
        ))}
      </div>
    </aside>
  );
}
