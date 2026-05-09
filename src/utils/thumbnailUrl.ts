// Builds the URL for /api/thumbnail/{id}.
//
// `listingUrl` (the listing's Redfin URL) is forwarded so the server can
// lazy-fetch the og:image into Vercel Blob on first hit for new listings —
// otherwise new MLS#s show only the placeholder SVG forever.

export function thumbnailUrl(
  id: string,
  listingUrl?: string,
  retry?: number,
  origin = ""
): string {
  const params = new URLSearchParams();
  if (listingUrl) params.set("url", listingUrl);
  if (retry && retry > 0) params.set("r", String(retry));
  const qs = params.toString();
  return `${origin}/api/thumbnail/${id}${qs ? `?${qs}` : ""}`;
}
