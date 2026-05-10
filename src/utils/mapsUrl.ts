/**
 * Builds a "navigate to this place" URL that opens in the user's native
 * Maps app on mobile (Apple Maps on iOS, Google Maps elsewhere) and falls
 * back to a Google Maps web URL on desktop.
 *
 * We use lat/lng coordinates as the destination — not the address string —
 * because (a) Apple Maps treats `ll` as the map center and silently ignores
 * `daddr` when both are present, and (b) lat/lng is unambiguous regardless
 * of how Redfin formatted the address (ranges like "2611-2615 Octavia"
 * don't geocode reliably). Both Apple Maps and Google Maps reverse-geocode
 * coordinates back to a labeled address automatically.
 *
 * `address` is appended as a `q=` query so the destination pin shows the
 * human-readable label on Apple Maps; Google Maps ignores it without harm.
 */
export function navigationUrl(
  lat: number,
  lng: number,
  address: string,
  city: string
): string {
  const dest = `${lat},${lng}`;
  const label = `${address}, ${city}`;
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    return `https://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(label)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&destination_place_id=${encodeURIComponent(label)}`;
}
