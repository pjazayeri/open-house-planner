import type { SortKey, FilterKey } from "../Sidebar";

export const SORT_LABELS: Record<SortKey, string> = {
  time: "Time",
  price: "Price",
  capRate: "Cap Rate",
  ppsf: "$/sqft",
};

export interface ActiveFilterInputs {
  mode: "browse" | "planner";
  searchQuery: string;
  selectedAreas: Set<string>;
  statusFilter: string;
  priceMin: number | null;
  priceMax: number | null;
  capRateMin: number | null;
  capRateMax: number | null;
  ppsfMin: number | null;
  ppsfMax: number | null;
  timeFrom: number | null;
  timeTo: number | null;
  activeFilters: Set<FilterKey>;
  selectedDate: string;
}

/**
 * Number of independently-applied filter dimensions (not chips). Shared by
 * the FilterPane summary line and the collapsed mobile "Filters & sort" bar.
 */
export function countActiveFilters(f: ActiveFilterInputs): number {
  return (
    (f.searchQuery.trim() ? 1 : 0) +
    (f.selectedAreas.size > 0 ? 1 : 0) +
    (f.mode === "browse" && f.statusFilter !== "Active" ? 1 : 0) +
    (f.priceMin !== null || f.priceMax !== null ? 1 : 0) +
    (f.capRateMin !== null || f.capRateMax !== null ? 1 : 0) +
    (f.ppsfMin !== null || f.ppsfMax !== null ? 1 : 0) +
    (f.timeFrom !== null || f.timeTo !== null ? 1 : 0) +
    f.activeFilters.size +
    (f.selectedDate ? 1 : 0)
  );
}
