import type { IncomingMessage, ServerResponse } from "node:http";
import { head, put } from "@vercel/blob";

const OG_IMAGE_RE = /og:image"\s+content="([^"]+)"/;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="400" height="240" fill="#f3f4f6"/><text x="200" y="130" text-anchor="middle" font-size="64" font-family="sans-serif" fill="#d1d5db">🏠</text></svg>`;

// Dedupe in-flight lazy fetches within this function instance so a fresh
// page load (50+ thumbnails at once) doesn't hammer Redfin with duplicate
// requests. Cross-instance races are tolerated — `put` is idempotent.
const inflight = new Map<string, Promise<Buffer | null>>();

async function fetchAndStore(mlsId: string, redfinUrl: string): Promise<Buffer | null> {
  // SSRF guard — only allow Redfin listing URLs.
  if (!/^https:\/\/www\.redfin\.com\//.test(redfinUrl)) return null;

  const existing = inflight.get(mlsId);
  if (existing) return existing;

  const task = (async () => {
    try {
      const r = await fetch(redfinUrl, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) return null;
      const html = await r.text();
      const ogUrl = OG_IMAGE_RE.exec(html)?.[1];
      if (!ogUrl) return null;
      const img = await fetch(ogUrl, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(15000),
      });
      if (!img.ok) return null;
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length < 1000) return null;
      // The Blob store is configured private; the GET path above re-fetches
      // via BLOB_READ_WRITE_TOKEN. Cast because @vercel/blob's TS types
      // only declare "public" but the runtime accepts "private" stores.
      await put(`thumbnails/${mlsId}.jpg`, buf, {
        access: "private",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        allowOverwrite: true,
      } as unknown as Parameters<typeof put>[2]);
      return buf;
    } catch (e) {
      console.error(`[thumbnail] ${mlsId} lazy fetch failed:`, e);
      return null;
    }
  })();

  inflight.set(mlsId, task);
  task.finally(() => inflight.delete(mlsId));
  return task;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "";
  const [path, queryString = ""] = url.split("?");
  const urlParts = path.split("/");
  const mlsId = urlParts[urlParts.length - 1] ?? "";

  if (!mlsId) {
    res.writeHead(400);
    res.end("Missing mlsId");
    return;
  }

  // 1. Try existing Blob first.
  try {
    const blob = await head(`thumbnails/${mlsId}.jpg`);
    const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
    const imgRes = await fetch(blob.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (imgRes.ok) {
      const buf = Buffer.from(await imgRes.arrayBuffer());
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, immutable",
      });
      res.end(buf);
      return;
    }
  } catch {
    // not in blob — fall through to lazy fetch
  }

  // 2. Lazy-fetch from Redfin if the client provided the listing URL.
  const params = new URLSearchParams(queryString);
  const redfinUrl = params.get("url");
  if (redfinUrl) {
    const buf = await fetchAndStore(mlsId, redfinUrl);
    if (buf) {
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=604800, immutable",
      });
      res.end(buf);
      return;
    }
  }

  // 3. Placeholder. Short cache so the next view picks up a real thumbnail
  // once it's been backfilled.
  res.writeHead(200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=60",
  });
  res.end(PLACEHOLDER_SVG);
}
