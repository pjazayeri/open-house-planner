/**
 * Parse Redfin date format like "March-1-2026 12:00 PM" into a Date object.
 */
export function parseRedfinDate(dateStr: string): Date | null {
  if (!dateStr || !dateStr.trim()) return null;

  // "March-1-2026 12:00 PM" -> "March 1, 2026 12:00 PM"
  const parts = dateStr.trim().split(" ");
  const datePart = parts[0]; // "March-1-2026"
  const timePart = parts.slice(1).join(" "); // "12:00 PM"

  const [month, day, year] = datePart.split("-");
  const normalized = `${month} ${day}, ${year} ${timePart}`;

  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Format a price as "$1,175,000"
 */
export function formatPrice(price: number): string {
  return "$" + price.toLocaleString("en-US");
}

/**
 * Format beds/baths like "2 bd / 2 ba" or "Studio / 1 ba"
 */
export function formatBedsBaths(beds: number, baths: number): string {
  const bedStr = beds === 0 ? "Studio" : `${beds} bd`;
  return `${bedStr} / ${baths} ba`;
}

/**
 * True iff the listing has a real (non-epoch) upcoming open house.
 * `transformAll` substitutes `new Date(0)` for missing open-house times so
 * those rows still render across the app; this guard hides "Wed, Dec 31 ·
 * 4:00 PM-4:00 PM" rows on listings that aren't holding an open house.
 */
export function hasOpenHouse(start: Date | null | undefined, end?: Date | null): boolean {
  if (!start) return false;
  if (start.getTime() <= 0) return false;
  if (end && end.getTime() <= 0) return false;
  return true;
}

/**
 * Format time range like "2:00 PM - 4:00 PM"
 */
export function formatTimeRange(start: Date, end: Date): string {
  if (!hasOpenHouse(start, end)) return "";
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  };
  return `${start.toLocaleTimeString("en-US", opts)} - ${end.toLocaleTimeString("en-US", opts)}`;
}

/**
 * Format just the time like "2:00 PM"
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Parse a numeric string, returning null for empty strings.
 */
export function parseNum(val: string): number | null {
  if (!val || !val.trim()) return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

