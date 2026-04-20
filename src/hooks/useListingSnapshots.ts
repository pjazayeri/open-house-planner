import { useState, useEffect } from "react";
import { cloudFetch, cloudPatch, USE_CLOUD } from "../utils/cloudSync";
import type { Listing } from "../types";

type StoredListing = Omit<Listing, "openHouseStart" | "openHouseEnd" | "archived" | "visitOrder" | "timeSlot"> & {
  openHouseStart: string;
  openHouseEnd: string;
};

function serialize(l: Listing): StoredListing {
  const { archived: _a, visitOrder: _v, timeSlot: _t, ...rest } = l;
  return { ...rest, openHouseStart: l.openHouseStart.toISOString(), openHouseEnd: l.openHouseEnd.toISOString() };
}

function deserialize(s: StoredListing): Listing {
  return { ...s, openHouseStart: new Date(s.openHouseStart), openHouseEnd: new Date(s.openHouseEnd), archived: true };
}

function isStoredListing(v: unknown): v is StoredListing {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.id === "string" && typeof r.address === "string" && typeof r.openHouseStart === "string";
}

const LOCAL_KEY = "listing-snapshots";

function readLocal(): Record<string, StoredListing> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, StoredListing> = {};
    for (const [id, v] of Object.entries(parsed)) {
      if (isStoredListing(v)) result[id] = v;
    }
    return result;
  } catch { return {}; }
}

function writeLocal(snapshots: Record<string, StoredListing>) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(snapshots)); } catch {}
}

export function useListingSnapshots() {
  // Seed immediately from localStorage — visited listings are available before
  // cloud responds, and survive if cloud sync was down when the listing disappeared.
  const [snapshots, setSnapshots] = useState<Record<string, StoredListing>>(readLocal);

  useEffect(() => {
    if (!USE_CLOUD) return;
    cloudFetch()
      .then((state) => {
        const cloudParsed: Record<string, StoredListing> = {};
        for (const [id, v] of Object.entries(state.listingSnapshots)) {
          if (isStoredListing(v)) cloudParsed[id] = v;
        }
        // Merge: local snapshots that aren't in cloud yet (saved while offline)
        // get pushed up; cloud wins on conflict.
        const local = readLocal();
        const localOnly: Record<string, unknown> = {};
        for (const [id, v] of Object.entries(local)) {
          if (!cloudParsed[id]) localOnly[id] = v;
        }
        const merged = { ...cloudParsed, ...local, ...cloudParsed };
        writeLocal(merged);
        setSnapshots(merged);
        // Push any local-only snapshots up to cloud
        if (Object.keys(localOnly).length > 0) {
          cloudPatch({ listingSnapshots: { ...state.listingSnapshots, ...localOnly } }).catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  async function saveSnapshots(listings: Listing[]): Promise<void> {
    if (listings.length === 0) return;
    const serialized = listings.map(serialize);

    // Write to localStorage immediately — synchronous, never fails due to network
    setSnapshots((prev) => {
      const next = { ...prev };
      for (const s of serialized) next[s.id] = s;
      writeLocal(next);
      return next;
    });

    // Best-effort cloud save
    if (!USE_CLOUD) return;
    try {
      const current = await cloudFetch();
      const merged: Record<string, unknown> = { ...current.listingSnapshots };
      for (const s of serialized) merged[s.id] = s;
      await cloudPatch({ listingSnapshots: merged });
    } catch {
      // Local copy is already saved; cloud will sync on next successful save
    }
  }

  const archivedListings: Listing[] = Object.values(snapshots).map(deserialize);

  return { saveSnapshots, archivedListings };
}
