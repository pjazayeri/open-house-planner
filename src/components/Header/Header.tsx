import type { TimeSlotGroup } from "../../types";
import "./Header.css";

interface HeaderProps {
  cities: string[];
  selectedCity: string;
  onCityChange: (city: string) => void;
  timeSlotGroups: TimeSlotGroup[];
  totalListings: number;
  hiddenCount: number;
  onRestoreHidden: () => void;
}

export function Header({
  cities,
  selectedCity,
  onCityChange,
  timeSlotGroups,
  totalListings,
  hiddenCount,
  onRestoreHidden,
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
