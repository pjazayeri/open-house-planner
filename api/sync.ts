import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const API_KEY = process.env.JSONBIN_API_KEY;
  if (!API_KEY) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Sync not configured" }));
    return;
  }

  // Authenticated requests send X-Bin-Id; unauthenticated fall back to env var (local dev)
  const binIdHeader = (req.headers["x-bin-id"] as string) ?? "";
  const BIN_ID = binIdHeader || process.env.JSONBIN_BIN_ID;

  if (!BIN_ID) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Sync not configured" }));
    return;
  }

  const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
  const authHeaders = { "X-Master-Key": API_KEY };

  if (req.method === "GET") {
    const r = await fetch(`${BIN_URL}/latest`, { headers: authHeaders });
    const body = await r.text();
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  if (req.method === "PUT") {
    const rawBody = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    const r = await fetch(BIN_URL, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: rawBody,
    });
    const body = await r.text();
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
}
