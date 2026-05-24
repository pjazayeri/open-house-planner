// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// Mock the cloud + CSV layers so we can drive the full useListings flow.
// Every cloud-backed hook (useHiddenIds, useVisits, useListingSnapshots,
// useAmenities, useRentEstimates) reads through these same mocks.
vi.mock("../utils/cloudSync", () => ({
  USE_CLOUD: true,
  cloudFetch: vi.fn(),
  cloudPatch: vi.fn().mockResolvedValue(undefined),
  getAuthHeaders: vi.fn().mockResolvedValue({}),
  setAuthContext: vi.fn(),
  setGuestMode: vi.fn(),
  clearAuthContext: vi.fn(),
}));
vi.mock("../utils/parseCsv", () => ({
  loadCsv: vi.fn(),
  loadDemoCsv: vi.fn().mockResolvedValue([]),
  uploadCsvText: vi.fn(),
}));

import { useListings } from "./useListings";
import { cloudFetch, cloudPatch } from "../utils/cloudSync";
import { loadCsv } from "../utils/parseCsv";
import type { RawListing } from "../types";

const cloudFetchMock = vi.mocked(cloudFetch);
const cloudPatchMock = vi.mocked(cloudPatch);
const loadCsvMock = vi.mocked(loadCsv);

const FUTURE = "December-31-2099 11:00 AM";
const FUTURE_END = "December-31-2099 01:00 PM";

// A current-CSV row where "100 Main St" is now MLS# NEW-456.
function csvRowNewMls(): RawListing {
  return {
    "MLS#": "NEW-456",
    ADDRESS: "100 Main St",
    CITY: "San Francisco",
    "STATE OR PROVINCE": "CA",
    "ZIP OR POSTAL CODE": "94115",
    STATUS: "Active",
    "NEXT OPEN HOUSE START TIME": FUTURE,
    "NEXT OPEN HOUSE END TIME": FUTURE_END,
    PRICE: "1000000",
    BEDS: "2",
    BATHS: "2",
    "SQUARE FEET": "1000",
    "YEAR BUILT": "2010",
    "DAYS ON MARKET": "5",
    "$/SQUARE FEET": "1000",
    "HOA/MONTH": "",
    "PROPERTY TYPE": "Condo/Co-op",
    LOCATION: "Pacific Heights",
    LATITUDE: "37.79",
    LONGITUDE: "-122.43",
    "URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)": "https://redfin.com/x",
  } as unknown as RawListing;
}

// Cloud state: user starred the property under its OLD MLS# in a prior
// session, and a snapshot of that old listing exists (the bandaid now
// snapshots stars, so this is realistic).
function cloudStateWithOldStar() {
  return {
    hiddenIds: [],
    priorityIds: ["OLD-123"],
    visits: {},
    listingSnapshots: {
      "OLD-123": {
        id: "OLD-123",
        address: "100 Main St",
        city: "San Francisco",
        location: "Pacific Heights",
        state: "CA",
        zip: "94115",
        price: 1_000_000,
        beds: 2,
        baths: 2,
        sqft: 1000,
        yearBuilt: 2010,
        daysOnMarket: 5,
        pricePerSqft: 1000,
        hoa: null,
        propertyType: "Condo/Co-op",
        openHouseStart: "2026-01-01T00:00:00.000Z",
        openHouseEnd: "2026-01-01T02:00:00.000Z",
        url: "https://redfin.com/x",
        lat: 37.79,
        lng: -122.43,
        capRate: 3,
        status: "Active",
      },
    },
    skippedForDay: {},
    mapZones: [],
    finFavoriteIds: [],
    amenities: {},
    rentEstimates: {},
  };
}

beforeEach(() => {
  cloudFetchMock.mockReset();
  cloudPatchMock.mockReset().mockResolvedValue(undefined);
  loadCsvMock.mockReset();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
    },
    configurable: true, writable: true,
  });
});
afterEach(() => vi.clearAllMocks());

describe("relink flow (integration): star survives an MLS# change via address", () => {
  it("rewrites priorityOrder from the old MLS# to the new one after a CSV reload", async () => {
    cloudFetchMock.mockResolvedValue(cloudStateWithOldStar());
    loadCsvMock.mockResolvedValue([csvRowNewMls()]);

    renderHook(() => useListings("signed-in"));

    // The relink effect should detect that priority "OLD-123" is orphaned,
    // look up its address via the snapshot, find "100 Main St" → "NEW-456" in
    // the fresh CSV, and persist the rewrite via importHiddenAndPriority →
    // cloudPatch({ priorityIds: ["NEW-456"], … }).
    await waitFor(() => {
      const relinkCall = cloudPatchMock.mock.calls.find(
        ([patch]) => Array.isArray(patch?.priorityIds) && patch.priorityIds.includes("NEW-456")
      );
      expect(relinkCall).toBeTruthy();
    }, { timeout: 2000 });

    // And it should NOT keep the dead old id.
    const relinkCall = cloudPatchMock.mock.calls.find(
      ([patch]) => Array.isArray(patch?.priorityIds) && patch.priorityIds.includes("NEW-456")
    )!;
    expect(relinkCall[0].priorityIds).not.toContain("OLD-123");
  });

  it("does NOT rewrite when the starred MLS# still exists in the new CSV", async () => {
    const state = cloudStateWithOldStar();
    state.priorityIds = ["NEW-456"]; // already current
    cloudFetchMock.mockResolvedValue(state);
    loadCsvMock.mockResolvedValue([csvRowNewMls()]);

    renderHook(() => useListings("signed-in"));

    // Give effects time to settle, then assert no priorityIds rewrite fired.
    await new Promise((r) => setTimeout(r, 300));
    const rewrote = cloudPatchMock.mock.calls.some(
      ([patch]) => patch && Object.prototype.hasOwnProperty.call(patch, "priorityIds")
    );
    expect(rewrote).toBe(false);
  });
});
