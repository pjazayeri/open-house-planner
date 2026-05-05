/**
 * Compact serialization for sharing plan data via URL hash.
 * Dates become ISO strings; only fields needed for rendering are kept.
 */
import type { TimeSlotGroup, Listing } from "../types";

export interface SerializedListing {
  id: string;
  addr: string;
  loc: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number | null;
  hoa: number | null;
  start: string;
  end: string;
  url: string;
  cap: number;
  lat: number;
  lng: number;
}

export interface SerializedGroup {
  label: string;
  start: string;
  end: string;
  listings: SerializedListing[];
}

export type SerializedPlan = SerializedGroup[];

export function serializePlan(groups: TimeSlotGroup[]): SerializedPlan {
  return groups.map((g) => ({
    label: g.label,
    start: g.startTime.toISOString(),
    end: g.endTime.toISOString(),
    listings: g.listings.map((l) => ({
      id: l.id,
      addr: l.address,
      loc: l.location,
      city: l.city,
      price: l.price,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      hoa: l.hoa,
      start: l.openHouseStart.toISOString(),
      end: l.openHouseEnd.toISOString(),
      url: l.url,
      cap: l.capRate,
      lat: l.lat,
      lng: l.lng,
    })),
  }));
}

export function deserializePlan(plan: SerializedPlan): TimeSlotGroup[] {
  return plan.map((g) => ({
    label: g.label,
    startTime: new Date(g.start),
    endTime: new Date(g.end),
    listings: g.listings.map((l) => ({
      id: l.id,
      address: l.addr,
      location: l.loc,
      city: l.city,
      state: "",
      zip: "",
      price: l.price,
      beds: l.beds,
      baths: l.baths,
      sqft: l.sqft,
      hoa: l.hoa,
      yearBuilt: null,
      daysOnMarket: null,
      pricePerSqft: l.sqft ? Math.round(l.price / l.sqft) : null,
      propertyType: "",
      openHouseStart: new Date(l.start),
      openHouseEnd: new Date(l.end),
      url: l.url,
      lat: l.lat ?? 0,
      lng: l.lng ?? 0,
      capRate: l.cap,
      capRateBreakdown: {} as Listing["capRateBreakdown"],
    })),
  }));
}

/**
 * Shifts all open house dates in a plan so the earliest one is in the future.
 * Preserves relative spacing between slots (e.g. Saturday + Sunday stay together).
 * Used for the demo plan so it always shows upcoming open houses.
 */
export function shiftPlanToFuture(groups: TimeSlotGroup[]): TimeSlotGroup[] {
  if (groups.length === 0) return groups;
  const earliest = groups.reduce((min, g) => g.startTime < min ? g.startTime : min, groups[0].startTime);
  const now = new Date();
  if (earliest > now) return groups; // already in the future

  // Advance by whole weeks until the earliest slot is in the future
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksNeeded = Math.ceil((now.getTime() - earliest.getTime()) / msPerWeek);
  const offsetMs = weeksNeeded * msPerWeek;

  return groups.map((g) => ({
    ...g,
    startTime: new Date(g.startTime.getTime() + offsetMs),
    endTime: new Date(g.endTime.getTime() + offsetMs),
    listings: g.listings.map((l) => ({
      ...l,
      openHouseStart: new Date(l.openHouseStart.getTime() + offsetMs),
      openHouseEnd: new Date(l.openHouseEnd.getTime() + offsetMs),
    })),
  }));
}

export function encodePlan(groups: TimeSlotGroup[]): string {
  return encodeURIComponent(JSON.stringify(serializePlan(groups)));
}

export function decodePlan(encoded: string): TimeSlotGroup[] | null {
  try {
    const plan = JSON.parse(decodeURIComponent(encoded)) as SerializedPlan;
    return deserializePlan(plan);
  } catch {
    return null;
  }
}
