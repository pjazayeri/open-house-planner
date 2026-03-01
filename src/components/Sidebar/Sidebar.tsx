import type { TimeSlotGroup as TimeSlotGroupType } from "../../types";
import { TimeSlotGroup } from "./TimeSlotGroup";
import "./Sidebar.css";

interface SidebarProps {
  timeSlotGroups: TimeSlotGroupType[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onHide: (id: string) => void;
}

export function Sidebar({
  timeSlotGroups,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onHide,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-content">
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
          />
        ))}
      </div>
    </aside>
  );
}
