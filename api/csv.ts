import type { IncomingMessage, ServerResponse } from "node:http";
import { list } from "@vercel/blob";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const { blobs } = await list({ prefix: "csv/redfin-favorites_" });
  if (!blobs.length) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No CSV found in Blob storage" }));
    return;
  }

  // Return the latest by pathname (filenames include ISO date so lexicographic = chronological)
  const sorted = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  const latest = sorted[sorted.length - 1];
  const token = process.env.BLOB_READ_WRITE_TOKEN ?? "";
  const csvRes = await fetch(latest.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!csvRes.ok) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Blob fetch failed: ${csvRes.status}` }));
    return;
  }
  const text = await csvRes.text();

  res.writeHead(200, { "Content-Type": "text/csv" });
  res.end(text);
}
