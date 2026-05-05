import type { IncomingMessage, ServerResponse } from "node:http";
import { head } from "@vercel/blob";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "";
  const urlParts = url.split("/");
  const mlsId = (urlParts[urlParts.length - 1] ?? "").split("?")[0];

  if (!mlsId) {
    res.writeHead(400);
    res.end("Missing mlsId");
    return;
  }

  try {
    const blob = await head(`thumbnails/${mlsId}.jpg`);
    const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
    const imgRes = await fetch(blob.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!imgRes.ok) throw new Error(`Blob fetch ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=604800, immutable",
    });
    res.end(buf);
  } catch {
    // No thumbnail in Blob or static files — return a placeholder SVG so the
    // browser never logs a 404. The PropertyCard onError handler won't fire,
    // but the card still shows a house icon via the SVG.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="400" height="240" fill="#f3f4f6"/><text x="200" y="130" text-anchor="middle" font-size="64" font-family="sans-serif" fill="#d1d5db">🏠</text></svg>`;
    res.writeHead(200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=60",
    });
    res.end(svg);
  }
}
