import type { TimeSlotGroup } from "../../types";
import type { SyncStatus } from "../../utils/cloudSync";
import "./Header.css";

interface HeaderProps {
  cities: string[];
  selectedCity: string;
  onCityChange: (city: string) => void;
  timeSlotGroups: TimeSlotGroup[];
  totalListings: number;
  hiddenCount: number;
  onRestoreHidden: () => void;
  syncStatus: SyncStatus;
  saveFailed: boolean;
  onShowSummary: () => void;
  onOpenData: () => void;
}

function SyncBadge({ syncStatus, saveFailed }: { syncStatus: SyncStatus; saveFailed: boolean }) {
  let cls = "sync-badge";
  let title = "";

  if (saveFailed) {
    cls += " sync-badge--warn";
    title = "Last save failed \u2014 changes may not be synced";
  } else if (syncStatus === "ok") {
    cls += " sync-badge--ok";
    title = "Synced to cloud";
  } else if (syncStatus === "error") {
    cls += " sync-badge--error";
    title = "Cloud sync error";
  } else {
    cls += " sync-badge--grey";
    title = syncStatus === "loading" ? "Syncing\u2026" : "Cloud sync not configured";
  }

  return <span className={cls} title={title} aria-label={title} />;
}

export function Header({
  cities,
  selectedCity,
  onCityChange,
  timeSlotGroups,
  totalListings,
  hiddenCount,
  onRestoreHidden,
  syncStatus,
  saveFailed,
  onShowSummary,
  onOpenData,
}: HeaderProps) {
  const cityCount = timeSlotGroups.reduce(
    (sum, g) => sum + g.listings.length,
    0
  );

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Open House Tour Planner</h1>
        <span className="header-stats">
          {cityCount} open houses in {selectedCity} &middot; {totalListings}{" "}
          total
        </span>
        {hiddenCount > 0 && (
          <button className="restore-btn" onClick={onRestoreHidden}>
            {hiddenCount} hidden &middot; Restore
          </button>
        )}
        <SyncBadge syncStatus={syncStatus} saveFailed={saveFailed} />
        <button className="summary-btn" onClick={onShowSummary}>Summary</button>
        <button className="summary-btn" onClick={onOpenData}>Data</button>
      </div>
      <div className="header-right">
        {cities.map((city) => (
          <button
            key={city}
            className={`city-pill ${city === selectedCity ? "active" : ""}`}
            onClick={() => onCityChange(city)}
          >
            {city}
          </button>
        ))}
      </div>
    </header>
  );
}
