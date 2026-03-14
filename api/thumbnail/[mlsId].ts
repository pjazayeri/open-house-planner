import type { IncomingMessage, ServerResponse } from "node:http";
import { head } from "@vercel/blob";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "";
  const mlsId = url.split("/").at(-1)?.split("?")[0] ?? "";

  if (!mlsId) {
    res.writeHead(400);
    res.end("Missing mlsId");
    return;
  }

  try {
    const blob = await head(`thumbnails/${mlsId}.jpg`);
    // Fetch from private blob URL (server-side) and stream to client
    const imgRes = await fetch(blob.url);
    if (!imgRes.ok) throw new Error(`Blob fetch ${imgRes.status}`);
    const buf = Buffer.from(await imgRes.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=604800, immutable",
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}
