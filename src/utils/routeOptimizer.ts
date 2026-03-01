import type { Listing, TimeSlotGroup } from "../types";
import { formatTimeRange } from "./formatters";

/**
 * Haversine distance between two lat/lng points in miles.
 */
function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Nearest-neighbor ordering starting from a given point.
 * Returns listings in optimized visit order.
 */
function nearestNeighborOrder(
  listings: Listing[],
  startLat?: number,
  startLng?: number
): Listing[] {
  if (listings.length <= 1) return [...listings];

  const remaining = [...listings];
  const ordered: Listing[] = [];

  // If we have a starting point, use it; otherwise start with the first listing
  let currentLat = startLat ?? remaining[0].lat;
  let currentLng = startLng ?? remaining[0].lng;

  // If no starting point, pick the first one and remove it
  if (startLat === undefined) {
    ordered.push(remaining.shift()!);
    currentLat = ordered[0].lat;
    currentLng = ordered[0].lng;
  }

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(currentLat, currentLng, remaining[i].lat, remaining[i].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    ordered.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return ordered;
}

/**
 * Group listings by their open house time slot, then optimize visit order
 * within and across time slots using nearest-neighbor.
 *
 * Returns time slot groups with listings in visit order, and listings
 * annotated with visitOrder numbers.
 */
export function optimizeRoute(listings: Listing[]): TimeSlotGroup[] {
  // Group by time slot key (start-end)
  const slotMap = new Map<string, Listing[]>();

  for (const listing of listings) {
    const key = `${listing.openHouseStart.getTime()}-${listing.openHouseEnd.getTime()}`;
    if (!slotMap.has(key)) {
      slotMap.set(key, []);
    }
    slotMap.get(key)!.push(listing);
  }

  // Sort slots by start time
  const sortedSlots = Array.from(slotMap.entries()).sort((a, b) => {
    const aStart = a[1][0].openHouseStart.getTime();
    const bStart = b[1][0].openHouseStart.getTime();
    return aStart - bStart;
  });

  const groups: TimeSlotGroup[] = [];
  let visitOrder = 1;
  let lastLat: number | undefined;
  let lastLng: number | undefined;

  for (const [, slotListings] of sortedSlots) {
    // Optimize order within this slot
    const ordered = nearestNeighborOrder(slotListings, lastLat, lastLng);

    // Assign visit order numbers
    for (const listing of ordered) {
      listing.visitOrder = visitOrder++;
    }

    // Track last position for chaining to next slot
    const lastListing = ordered[ordered.length - 1];
    lastLat = lastListing.lat;
    lastLng = lastListing.lng;

    const start = ordered[0].openHouseStart;
    const end = ordered[0].openHouseEnd;

    groups.push({
      label: `${formatTimeRange(start, end)} (${ordered.length} home${ordered.length !== 1 ? "s" : ""})`,
      startTime: start,
      endTime: end,
      listings: ordered,
    });
  }

  return groups;
}
