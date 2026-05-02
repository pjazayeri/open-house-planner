import { useState, useEffect } from "react";
import type { Listing } from "../types";
import { USE_CLOUD, cloudFetch, cloudPatch } from "../utils/cloudSync";

export interface RentEstimate {
  rent: number;
  low: number;
  high: number;
  comparables: number;
  fetchedAt: string; // ISO
}

const LS_KEY = "rent-estimates";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function parseRentEstimate(raw: unknown): RentEstimate | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.rent !== "number") return null;
  return {
    rent: r.rent,
    low: typeof r.low === "number" ? r.low : r.rent,
    high: typeof r.high === "number" ? r.high : r.rent,
    comparables: typeof r.comparables === "number" ? r.comparables : 0,
    fetchedAt: typeof r.fetchedAt === "string" ? r.fetchedAt : new Date().toISOString(),
  };
}

function isStale(est: RentEstimate): boolean {
  return Date.now() - new Date(est.fetchedAt).getTime() >= TTL_MS;
}

function parseLocal(): Record<string, RentEstimate> {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (!v) return {};
    const parsed = JSON.parse(v) as Record<string, unknown>;
    const fresh: Record<string, RentEstimate> = {};
    for (const [id, raw] of Object.entries(parsed)) {
      const est = parseRentEstimate(raw);
      if (est && !isStale(est)) fresh[id] = est;
    }
    return fresh;
  } catch {
    return {};
  }
}

function saveLocal(estimates: Record<string, RentEstimate>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(estimates)); } catch {}
}

function mergeWithCloud(
  local: Record<string, RentEstimate>,
  cloud: Record<string, unknown>
): Record<string, RentEstimate> {
  const merged = { ...local };
  for (const [id, raw] of Object.entries(cloud)) {
    const est = parseRentEstimate(raw);
    if (!est || isStale(est)) continue;
    const existing = merged[id];
    if (!existing || new Date(est.fetchedAt) > new Date(existing.fetchedAt)) {
      merged[id] = est;
    }
  }
  return merged;
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
    const parsed = JSON.parse(v) as Record<string, unknown>;
    const est = parseRentEstimate(parsed[id]);
    if (!est || isStale(est)) return null;
    return est;
  } catch {
    return null;
  }
}

export function useRentEstimates() {
  const [estimates, setEstimates] = useState<Record<string, RentEstimate>>(parseLocal);

  // On mount, merge cloud estimates into local cache
  useEffect(() => {
    if (!USE_CLOUD) return;
    cloudFetch()
      .then((state) => {
        setEstimates((local) => {
          const merged = mergeWithCloud(local, state.rentEstimates);
          saveLocal(merged);
          return merged;
        });
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        if (USE_CLOUD) {
          cloudPatch({ rentEstimates: next }).catch(() => {});
        }
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
