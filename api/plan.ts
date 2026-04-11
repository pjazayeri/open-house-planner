import type { IncomingMessage, ServerResponse } from "node:http";

const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const apiKey = process.env.JSONBIN_API_KEY;
  if (!apiKey) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not configured" }));
    return;
  }

  const url = req.url ?? "";
  const id = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get("id") ?? "";
  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Missing id" }));
    return;
  }

  const r = await fetch(`${JSONBIN_BASE}/${id}/latest`, {
    headers: { "X-Master-Key": apiKey },
  });

  if (!r.ok) {
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Plan not found" }));
    return;
  }

  const data = await r.json() as { record?: unknown };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data.record));
}
