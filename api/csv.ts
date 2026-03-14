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
  const latest = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).at(-1)!;
  const csvRes = await fetch(latest.url);
  const text = await csvRes.text();

  res.writeHead(200, { "Content-Type": "text/csv" });
  res.end(text);
}
