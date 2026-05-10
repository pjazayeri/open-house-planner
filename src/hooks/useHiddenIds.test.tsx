// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import * as cloudSync from "../utils/cloudSync";
import { useHiddenIds } from "./useHiddenIds";

function emptyState(overrides: Partial<cloudSync.CloudState> = {}): cloudSync.CloudState {
  return {
    hiddenIds: [],
    priorityIds: [],
    visits: {},
    listingSnapshots: {},
    skippedForDay: {},
    mapZones: [],
    finFavoriteIds: [],
    amenities: {},
    rentEstimates: {},
    ...overrides,
  };
}

describe("useHiddenIds: legacy finFavoriteIds → priorityIds migration", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("unions legacy finFavoriteIds into priorityIds and clears the legacy field", async () => {
    vi.spyOn(cloudSync, "cloudFetch").mockResolvedValue(
      emptyState({ priorityIds: ["A"], finFavoriteIds: ["B", "C"] })
    );
    const patchSpy = vi.spyOn(cloudSync, "cloudPatch").mockResolvedValue(undefined);

    const { result } = renderHook(() => useHiddenIds("signed-in"));
    await waitFor(() => expect(result.current.priorityIds.size).toBe(3));
    expect([...result.current.priorityIds].sort()).toEqual(["A", "B", "C"]);

    // Migration writes the merged set + clears finFavoriteIds.
    expect(patchSpy).toHaveBeenCalledTimes(1);
    const arg = patchSpy.mock.calls[0][0];
    expect((arg.priorityIds ?? []).sort()).toEqual(["A", "B", "C"]);
    expect(arg.finFavoriteIds).toEqual([]);
  });

  it("does NOT migrate or write when there are no legacy finFavoriteIds", async () => {
    vi.spyOn(cloudSync, "cloudFetch").mockResolvedValue(
      emptyState({ priorityIds: ["X", "Y"] })
    );
    const patchSpy = vi.spyOn(cloudSync, "cloudPatch").mockResolvedValue(undefined);

    const { result } = renderHook(() => useHiddenIds("signed-in"));
    await waitFor(() => expect(result.current.priorityIds.size).toBe(2));
    expect(patchSpy).not.toHaveBeenCalled();
  });

  it("dedupes when a legacy fav is already in priorityIds", async () => {
    vi.spyOn(cloudSync, "cloudFetch").mockResolvedValue(
      emptyState({ priorityIds: ["A", "B"], finFavoriteIds: ["B", "C"] })
    );
    const patchSpy = vi.spyOn(cloudSync, "cloudPatch").mockResolvedValue(undefined);
    const { result } = renderHook(() => useHiddenIds("signed-in"));
    await waitFor(() => expect(result.current.priorityIds.size).toBe(3));
    const arg = patchSpy.mock.calls[0][0];
    expect((arg.priorityIds ?? []).sort()).toEqual(["A", "B", "C"]);
  });
});
