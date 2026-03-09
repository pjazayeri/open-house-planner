import { useRef } from "react";
import type { TimeSlotGroup } from "../../types";
import type { SyncStatus } from "../../utils/cloudSync";
import type { Page } from "../../App";
import "./Header.css";

interface HeaderProps {
  page: Page;
  onNavigate: (page: Page) => void;
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
  onUploadCsv: (text: string) => void;
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
  } else if (syncStatus === "degraded") {
    cls += " sync-badge--warn";
    title = "Cloud sync unavailable (invalid credentials) \u2014 running locally";
  } else {
    cls += " sync-badge--grey";
    title = syncStatus === "loading" ? "Syncing\u2026" : "Cloud sync not configured";
  }

  return <span className={cls} title={title} aria-label={title} />;
}

export function Header({
  page,
  onNavigate,
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
  onUploadCsv,
}: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") onUploadCsv(text);
    };
    reader.readAsText(file);
    e.target.value = ""; // reset so same file can be re-uploaded
  }
  const cityCount = timeSlotGroups.reduce(
    (sum, g) => sum + g.listings.length,
    0
  );

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Open House Planner</h1>
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
      </div>

      <nav className="header-nav">
        <button
          className={`nav-tab ${page === "home" ? "active" : ""}`}
          onClick={() => onNavigate("home")}
        >
          Browse
        </button>
        <button
          className={`nav-tab ${page === "planner" || page === "priority" ? "active" : ""}`}
          onClick={() => onNavigate("planner")}
        >
          Open Houses
        </button>
        <button
          className={`nav-tab ${page === "data" ? "active" : ""}`}
          onClick={() => onNavigate("data")}
        >
          Data
        </button>
        <button
          className={`nav-tab ${page === "finance" ? "active" : ""}`}
          onClick={() => onNavigate("finance")}
        >
          Finance
        </button>
        <button
          className={`nav-tab ${page === "analytics" ? "active" : ""}`}
          onClick={() => onNavigate("analytics")}
        >
          Analytics
        </button>
        <button className="nav-tab nav-tab--summary" onClick={onShowSummary}>
          Summary
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          className="nav-tab nav-tab--upload"
          onClick={() => fileInputRef.current?.click()}
          title="Upload a Redfin favorites CSV to update listings"
        >
          ↑ Upload CSV
        </button>
      </nav>

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
