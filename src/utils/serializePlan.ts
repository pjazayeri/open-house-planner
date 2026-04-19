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
