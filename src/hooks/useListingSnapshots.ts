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

export function useListingSnapshots() {
  const [snapshots, setSnapshots] = useState<Record<string, StoredListing>>({});

  useEffect(() => {
    if (!USE_CLOUD) return;
    cloudFetch()
      .then((state) => {
        const parsed: Record<string, StoredListing> = {};
        for (const [id, v] of Object.entries(state.listingSnapshots)) {
          if (isStoredListing(v)) parsed[id] = v;
        }
        setSnapshots(parsed);
      })
      .catch(() => {});
  }, []);

  async function saveSnapshots(listings: Listing[]): Promise<void> {
    if (!USE_CLOUD || listings.length === 0) return;
    const current = await cloudFetch();
    const merged: Record<string, unknown> = { ...current.listingSnapshots };
    for (const l of listings) merged[l.id] = serialize(l);
    setSnapshots((prev) => {
      const next = { ...prev };
      for (const l of listings) next[l.id] = serialize(l);
      return next;
    });
    await cloudPatch({ listingSnapshots: merged });
  }

  const archivedListings: Listing[] = Object.values(snapshots).map(deserialize);

  return { saveSnapshots, archivedListings };
}
