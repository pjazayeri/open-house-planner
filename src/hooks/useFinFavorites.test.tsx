// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import * as cloudSync from "../utils/cloudSync";
import { useFinFavorites } from "./useFinFavorites";

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

describe("useFinFavorites (regression: 'Favorites filter on Finance does nothing')", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT call cloudFetch while authMode is 'loading'", () => {
    const fetchSpy = vi.spyOn(cloudSync, "cloudFetch");
    renderHook(() => useFinFavorites("loading"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads existing finFavoriteIds from cloud once auth is ready", async () => {
    vi.spyOn(cloudSync, "cloudFetch").mockResolvedValue(
      emptyState({ finFavoriteIds: ["A", "B", "C"] })
    );
    const { result } = renderHook(() => useFinFavorites("signed-in"));
    await waitFor(() => expect(result.current.finFavoriteIds.size).toBe(3));
    expect([...result.current.finFavoriteIds].sort()).toEqual(["A", "B", "C"]);
  });

  it("toggleFinFavorite is a no-op before the initial fetch resolves (protects cloud state)", async () => {
    let resolve!: (s: cloudSync.CloudState) => void;
    vi.spyOn(cloudSync, "cloudFetch").mockReturnValue(new Promise((r) => { resolve = r; }));
    const patchSpy = vi.spyOn(cloudSync, "cloudPatch").mockResolvedValue(undefined);

    const { result } = renderHook(() => useFinFavorites("signed-in"));
    act(() => result.current.toggleFinFavorite("NEW"));
    expect(patchSpy).not.toHaveBeenCalled();
    expect(result.current.finFavoriteIds.size).toBe(0);

    await act(async () => { resolve(emptyState({ finFavoriteIds: ["A", "B"] })); });
    await waitFor(() => expect(result.current.finFavoriteIds.size).toBe(2));

    // After load, toggling adds to the existing set rather than overwriting it.
    act(() => result.current.toggleFinFavorite("NEW"));
    expect(patchSpy).toHaveBeenCalledTimes(1);
    const patchArg = patchSpy.mock.calls[0][0];
    expect((patchArg.finFavoriteIds ?? []).sort()).toEqual(["A", "B", "NEW"]);
    expect(result.current.finFavoriteIds.has("NEW")).toBe(true);
  });

  it("toggle removes an existing id", async () => {
    vi.spyOn(cloudSync, "cloudFetch").mockResolvedValue(emptyState({ finFavoriteIds: ["X", "Y"] }));
    const patchSpy = vi.spyOn(cloudSync, "cloudPatch").mockResolvedValue(undefined);
    const { result } = renderHook(() => useFinFavorites("signed-in"));
    await waitFor(() => expect(result.current.finFavoriteIds.size).toBe(2));

    act(() => result.current.toggleFinFavorite("X"));
    expect(result.current.finFavoriteIds.has("X")).toBe(false);
    expect(result.current.finFavoriteIds.has("Y")).toBe(true);
    const patchArg = patchSpy.mock.calls[0][0];
    expect(patchArg.finFavoriteIds).toEqual(["Y"]);
  });
});
