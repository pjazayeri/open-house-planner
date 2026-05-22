import { useState } from "react";
import type { MapZone } from "../../../types";
import type { SortKey, FilterKey } from "../Sidebar";
import { Chip } from "./Chip";
import { RangeFilter, type RangePreset } from "./RangeFilter";
import { ActiveFiltersSummary } from "./ActiveFiltersSummary";

const SORT_LABELS: Record<SortKey, string> = {
  time: "Time",
  price: "Price",
  capRate: "Cap Rate",
  ppsf: "$/sqft",
};

const REACTION_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "liked", label: "👍 Liked" },
  { key: "disliked", label: "👎 Disliked" },
];
const VISIT_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "visited", label: "Visited" },
  { key: "unvisited", label: "Unvisited" },
];
const TAG_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "rated", label: "★ Rated" },
  { key: "priority", label: "★ Priority" },
  { key: "notPriority", label: "Not priority" },
];

const STATUS_ACCENTS: Record<string, string> = {
  Active: "#2563eb",
  Pending: "#d97706",
  Contingent: "#ea580c",
  Sold: "#475569",
};

const PRICE_MIN_PRESETS: RangePreset[] = [500_000, 750_000, 1_000_000, 1_250_000, 1_500_000, 1_750_000, 2_000_000, 2_500_000, 3_000_000]
  .map((v) => ({ value: v, label: fmtPrice(v) }));
const PRICE_MAX_PRESETS: RangePreset[] = [750_000, 1_000_000, 1_250_000, 1_500_000, 1_750_000, 2_000_000, 2_500_000, 3_000_000, 4_000_000]
  .map((v) => ({ value: v, label: fmtPrice(v) }));
const CAP_RATE_MIN_PRESETS: RangePreset[] = [1, 2, 3, 4, 5, 6].map((v) => ({ value: v, label: `${v}%` }));
const CAP_RATE_MAX_PRESETS: RangePreset[] = [2, 3, 4, 5, 6, 8].map((v) => ({ value: v, label: `${v}%` }));
const PPSF_MIN_PRESETS: RangePreset[] = [400, 600, 800, 1000, 1200, 1500].map((v) => ({ value: v, label: `$${v}` }));
const PPSF_MAX_PRESETS: RangePreset[] = [600, 800, 1000, 1200, 1500, 2000].map((v) => ({ value: v, label: `$${v}` }));
const HOUR_MIN_PRESETS: RangePreset[] = [8, 9, 10, 11, 12, 13, 14, 15, 16].map((v) => ({ value: v, label: fmtHour(v) }));
const HOUR_MAX_PRESETS: RangePreset[] = [9, 10, 11, 12, 13, 14, 15, 16, 17].map((v) => ({ value: v, label: fmtHour(v) }));

function fmtHour(h: number): string {
  if (h === 12) return "12pm";
  if (h === 0) return "12am";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
function fmtPrice(v: number): string {
  return v >= 1_000_000 ? `$${v / 1_000_000}M` : `$${v / 1_000}K`;
}

interface FilterPaneProps {
  mode: "browse" | "planner";
  searchQuery: string;
  onSearchChange: (q: string) => void;
  zones: MapZone[];
  selectedAreas: Set<string>;
  onAreaChange: (zoneId: string) => void;
  statusFilter: string;
  statusCounts: Record<string, number>;
  onStatusFilterChange: (s: string) => void;
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
  activeFilters: Set<FilterKey>;
  onFiltersChange: (next: Set<FilterKey>) => void;
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
  onTimeFromChange: (v: number | null) => void;
  onTimeToChange: (v: number | null) => void;
  selectedDate: string;
  totalVisible: number;
  totalListings: number;
}

export function FilterPane(props: FilterPaneProps) {
  const {
    mode,
    searchQuery, onSearchChange,
    zones, selectedAreas, onAreaChange,
    statusFilter, statusCounts, onStatusFilterChange,
    sortKey, onSortChange,
    activeFilters, onFiltersChange,
    priceMin, priceMax, onPriceMinChange, onPriceMaxChange,
    capRateMin, capRateMax, onCapRateMinChange, onCapRateMaxChange,
    ppsfMin, ppsfMax, onPpsfMinChange, onPpsfMaxChange,
    timeFrom, timeTo, onTimeFromChange, onTimeToChange,
    selectedDate,
    totalVisible, totalListings,
  } = props;

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Active-filter count is the source of truth for "Showing X of Y · N filters · Clear all"
  // — count each independently-applied dimension, not each chip.
  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) +
    (selectedAreas.size > 0 ? 1 : 0) +
    (mode === "browse" && statusFilter !== "Active" ? 1 : 0) +
    (priceMin !== null || priceMax !== null ? 1 : 0) +
    (capRateMin !== null || capRateMax !== null ? 1 : 0) +
    (ppsfMin !== null || ppsfMax !== null ? 1 : 0) +
    (timeFrom !== null || timeTo !== null ? 1 : 0) +
    activeFilters.size +
    (selectedDate ? 1 : 0);
  const anyActive = activeFilterCount > 0 || sortKey !== "time";

  function toggleFilter(k: FilterKey) {
    const next = new Set(activeFilters);
    if (next.has(k)) next.delete(k); else next.add(k);
    onFiltersChange(next);
  }

  function clearAll() {
    onSearchChange("");
    if (selectedAreas.size > 0) onAreaChange(""); // empty key clears
    if (mode === "browse" && statusFilter !== "Active") onStatusFilterChange("Active");
    onPriceMinChange(null);
    onPriceMaxChange(null);
    onCapRateMinChange(null);
    onCapRateMaxChange(null);
    onPpsfMinChange(null);
    onPpsfMaxChange(null);
    onTimeFromChange(null);
    onTimeToChange(null);
    onFiltersChange(new Set());
    onSortChange("time");
  }

  const browseStatuses = ["Active", "Pending", "Contingent", "Sold"].filter(
    (s) => (statusCounts[s] ?? 0) > 0 || s === "Active"
  );

  return (
    <div className="sidebar-controls">
      {/* Search */}
      <div className="sb-search-row">
        <input
          className="sb-search-input"
          type="text"
          placeholder="Search address, zip, city…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button className="sb-search-clear" onClick={() => onSearchChange("")} aria-label="Clear search">✕</button>
        )}
      </div>

      {/* Area (zones) */}
      {zones.length > 0 && (
        <div className="filter-group">
          <div className="filter-eyebrow">Area</div>
          <div className="filter-group-chips">
            {zones.map((z) => (
              <Chip
                key={z.id}
                selected={selectedAreas.has(z.id)}
                accent={z.color}
                withDot
                onClick={() => onAreaChange(z.id)}
              >
                {z.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Status (browse mode only) */}
      {mode === "browse" && browseStatuses.length > 1 && (
        <div className="filter-group">
          <div className="filter-eyebrow">Status</div>
          <div className="filter-group-chips">
            {browseStatuses.map((s) => (
              <Chip
                key={s}
                selected={statusFilter === s}
                count={statusCounts[s]}
                accent={STATUS_ACCENTS[s]}
                onClick={() => onStatusFilterChange(statusFilter === s ? "Active" : s)}
              >
                {s}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/* Sort */}
      <div className="filter-group">
        <div className="filter-eyebrow">Sort</div>
        <div className="filter-group-chips">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <Chip key={k} selected={sortKey === k} onClick={() => onSortChange(k)}>
              {SORT_LABELS[k]}
            </Chip>
          ))}
        </div>
      </div>

      {/* Summary + clear-all (visible whenever anything is narrowing) */}
      {anyActive && (
        <ActiveFiltersSummary
          totalVisible={totalVisible}
          totalListings={totalListings}
          activeCount={activeFilterCount}
          onClearAll={clearAll}
        />
      )}

      {/* More filters disclosure */}
      <button
        className="filter-disclosure"
        aria-expanded={showAdvanced}
        onClick={() => setShowAdvanced((v) => !v)}
      >
        More filters
        <span className="filter-disclosure-chevron">▾</span>
      </button>

      {showAdvanced && (
        <>
          {/* Open-house time window (planner only) */}
          {mode === "planner" && (
            <RangeFilter
              label="Open-house time"
              min={timeFrom}
              max={timeTo}
              minPresets={HOUR_MIN_PRESETS}
              maxPresets={HOUR_MAX_PRESETS}
              onMinChange={onTimeFromChange}
              onMaxChange={onTimeToChange}
            />
          )}
          <RangeFilter
            label="Price"
            min={priceMin}
            max={priceMax}
            minPresets={PRICE_MIN_PRESETS}
            maxPresets={PRICE_MAX_PRESETS}
            onMinChange={onPriceMinChange}
            onMaxChange={onPriceMaxChange}
          />
          <RangeFilter
            label="Cap rate"
            min={capRateMin}
            max={capRateMax}
            minPresets={CAP_RATE_MIN_PRESETS}
            maxPresets={CAP_RATE_MAX_PRESETS}
            onMinChange={onCapRateMinChange}
            onMaxChange={onCapRateMaxChange}
          />
          <RangeFilter
            label="$ per sqft"
            min={ppsfMin}
            max={ppsfMax}
            minPresets={PPSF_MIN_PRESETS}
            maxPresets={PPSF_MAX_PRESETS}
            onMinChange={onPpsfMinChange}
            onMaxChange={onPpsfMaxChange}
          />

          {/* Reaction filters */}
          <div className="filter-group">
            <div className="filter-eyebrow">Reaction</div>
            <div className="filter-group-chips">
              {REACTION_FILTERS.map((f) => (
                <Chip key={f.key} selected={activeFilters.has(f.key)} onClick={() => toggleFilter(f.key)}>
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>
          {/* Visit filters */}
          <div className="filter-group">
            <div className="filter-eyebrow">Visit</div>
            <div className="filter-group-chips">
              {VISIT_FILTERS.map((f) => (
                <Chip key={f.key} selected={activeFilters.has(f.key)} onClick={() => toggleFilter(f.key)}>
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>
          {/* Tag filters */}
          <div className="filter-group">
            <div className="filter-eyebrow">Tag</div>
            <div className="filter-group-chips">
              {TAG_FILTERS.map((f) => (
                <Chip key={f.key} selected={activeFilters.has(f.key)} onClick={() => toggleFilter(f.key)}>
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
