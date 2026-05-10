/**
 * Builds a "navigate to this place" URL that opens in the user's native
 * Maps app on mobile (Apple Maps on iOS, Google Maps elsewhere) and falls
 * back to a Google Maps web URL on desktop.
 */
export function navigationUrl(
  lat: number,
  lng: number,
  address: string,
  city: string
): string {
  const dest = `${address}, ${city}`;
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    // maps.apple.com is a universal link — iOS opens the Maps app directly.
    return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}&ll=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
