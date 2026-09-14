import { describe, it, expect } from "vitest";
import { countActiveFilters, type ActiveFilterInputs } from "./countActiveFilters";

const base: ActiveFilterInputs = {
  mode: "browse", searchQuery: "", selectedAreas: new Set(), statusFilter: "Active",
  priceMin: null, priceMax: null, capRateMin: null, capRateMax: null, ppsfMin: null, ppsfMax: null,
  timeFrom: null, timeTo: null, activeFilters: new Set(), selectedDate: "",
};

describe("countActiveFilters", () => {
  it("is zero with defaults", () => {
    expect(countActiveFilters(base)).toBe(0);
  });
  it("counts each dimension once, chips individually", () => {
    expect(countActiveFilters({ ...base, priceMin: 1, priceMax: 2, searchQuery: " x " })).toBe(2);
    expect(countActiveFilters({ ...base, activeFilters: new Set(["liked", "visited"]) })).toBe(2);
  });
  it("only counts a non-Active status in browse mode", () => {
    expect(countActiveFilters({ ...base, statusFilter: "Sold" })).toBe(1);
    expect(countActiveFilters({ ...base, mode: "planner", statusFilter: "Sold" })).toBe(0);
  });
});
