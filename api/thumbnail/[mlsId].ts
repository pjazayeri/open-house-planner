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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(404, { "X-Thumb-Error": msg.slice(0, 200) });
    res.end("Not found");
  }
}
