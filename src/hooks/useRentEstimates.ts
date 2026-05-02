import { useState } from "react";
import type { Listing } from "../types";

export interface RentEstimate {
  rent: number;
  low: number;
  high: number;
  comparables: number;
  fetchedAt: string; // ISO
}

const LS_KEY = "rent-estimates";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function parseLocal(): Record<string, RentEstimate> {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (!v) return {};
    const parsed = JSON.parse(v) as Record<string, RentEstimate>;
    const now = Date.now();
    const fresh: Record<string, RentEstimate> = {};
    for (const [id, est] of Object.entries(parsed)) {
      if (now - new Date(est.fetchedAt).getTime() < TTL_MS) fresh[id] = est;
    }
    return fresh;
  } catch {
    return {};
  }
}

function saveLocal(estimates: Record<string, RentEstimate>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(estimates)); } catch {}
}

function toRentCastType(propertyType: string): string {
  const pt = propertyType.toLowerCase();
  if (pt.includes("condo")) return "Condo";
  if (pt.includes("single family")) return "Single Family";
  if (pt.includes("multi-family")) return "Multi Family";
  if (pt.includes("townhouse")) return "Townhouse";
  return "Apartment";
}

/** Read a cached estimate synchronously (for use outside of hooks). */
export function readRentEstimate(id: string): RentEstimate | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (!v) return null;
    const parsed = JSON.parse(v) as Record<string, RentEstimate>;
    const est = parsed[id];
    if (!est) return null;
    if (Date.now() - new Date(est.fetchedAt).getTime() >= TTL_MS) return null;
    return est;
  } catch {
    return null;
  }
}

export function useRentEstimates() {
  const [estimates, setEstimates] = useState<Record<string, RentEstimate>>(parseLocal);

  async function fetchEstimate(listing: Listing): Promise<RentEstimate | null> {
    if (estimates[listing.id]) return estimates[listing.id];

    const params = new URLSearchParams({
      address: `${listing.address}, ${listing.city}, ${listing.state} ${listing.zip}`,
      bedrooms: String(listing.beds),
      bathrooms: String(listing.baths),
      propertyType: toRentCastType(listing.propertyType),
    });
    if (listing.sqft) params.set("squareFootage", String(listing.sqft));

    try {
      const r = await fetch(`/api/rent-estimate?${params}`);
      if (!r.ok) return null;
      const data = await r.json();
      if (!data.rent) return null;

      const estimate: RentEstimate = {
        rent: Math.round(data.rent),
        low: Math.round(data.rentRangeLow ?? data.rent * 0.9),
        high: Math.round(data.rentRangeHigh ?? data.rent * 1.1),
        comparables: data.comparables?.length ?? 0,
        fetchedAt: new Date().toISOString(),
      };

      setEstimates((prev) => {
        const next = { ...prev, [listing.id]: estimate };
        saveLocal(next);
        return next;
      });
      return estimate;
    } catch {
      return null;
    }
  }

  return {
    estimates,
    fetchEstimate,
    getEstimate: (id: string) => estimates[id] ?? null,
  };
}
