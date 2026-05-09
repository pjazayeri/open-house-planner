// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

import * as cloudSync from "../utils/cloudSync";
import { useMapZones } from "./useMapZones";
import type { MapZone } from "../types";

const ZONE_A: MapZone = { id: "a", name: "A", color: "#000", polygon: [[37.7, -122.4]] };
const ZONE_B: MapZone = { id: "b", name: "B", color: "#000", polygon: [[37.8, -122.5]] };
const NEW_ZONE: MapZone = { id: "c", name: "C", color: "#fff", polygon: [[37.9, -122.6]] };

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

describe("useMapZones (regression: zones must persist across refresh)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does NOT call cloudFetch while authMode is 'loading'", () => {
    const fetchSpy = vi.spyOn(cloudSync, "cloudFetch");
    renderHook(() => useMapZones("loading"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls cloudFetch once authMode is 'signed-in' and loads existing zones", async () => {
    vi.spyOn(cloudSync, "cloudFetch").mockResolvedValue(
      emptyState({ mapZones: [ZONE_A, ZONE_B] })
    );

    const { result } = renderHook(() => useMapZones("signed-in"));
    await waitFor(() => expect(result.current.zones).toHaveLength(2));
    expect(result.current.zones.map((z) => z.id)).toEqual(["a", "b"]);
  });

  it("does NOT call cloudPatch when addZone fires before the initial fetch resolves", async () => {
    // This is the regression: previously, a fetch failure (or pre-auth call)
    // left zones=[] locally, and the next addZone clobbered cloud zones with
    // the empty-plus-new state. The `loaded` guard must prevent that write.
    let resolveFetch: (s: cloudSync.CloudState) => void = () => {};
    vi.spyOn(cloudSync, "cloudFetch").mockReturnValue(
      new Promise((r) => {
        resolveFetch = r;
      })
    );
    const patchSpy = vi.spyOn(cloudSync, "cloudPatch").mockResolvedValue(undefined);

    const { result } = renderHook(() => useMapZones("signed-in"));

    // Fire addZone *before* the fetch resolves.
    act(() => result.current.addZone(NEW_ZONE));
    expect(patchSpy).not.toHaveBeenCalled();

    // Resolve the fetch with pre-existing cloud zones; only after this should
    // a subsequent addZone trigger persistence.
    await act(async () => {
      resolveFetch(emptyState({ mapZones: [ZONE_A, ZONE_B] }));
    });
    await waitFor(() => expect(result.current.zones).toHaveLength(2));

    act(() => result.current.addZone(NEW_ZONE));
    expect(patchSpy).toHaveBeenCalledTimes(1);
    const patchArg = patchSpy.mock.calls[0][0];
    expect(patchArg.mapZones?.map((z) => z.id)).toEqual(["a", "b", "c"]);
  });

  it("does NOT call cloudPatch when the initial fetch fails", async () => {
    vi.spyOn(cloudSync, "cloudFetch").mockRejectedValue(
      Object.assign(new Error("auth not ready"), { authError: true })
    );
    const patchSpy = vi.spyOn(cloudSync, "cloudPatch").mockResolvedValue(undefined);

    const { result } = renderHook(() => useMapZones("signed-in"));

    // Wait long enough for the rejection to propagate.
    await waitFor(() => expect(cloudSync.cloudFetch).toHaveBeenCalled());

    act(() => result.current.addZone(NEW_ZONE));
    expect(patchSpy).not.toHaveBeenCalled();
  });
});
