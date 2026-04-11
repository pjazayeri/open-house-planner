import type { IncomingMessage, ServerResponse } from "node:http";

const JSONBIN_BASE = "https://api.jsonbin.io/v3/b";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const apiKey = process.env.JSONBIN_API_KEY;
  if (!apiKey) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Share not configured" }));
    return;
  }

  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  const r = await fetch(JSONBIN_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": apiKey,
      "X-Bin-Private": "false",
    },
    body,
  });

  if (!r.ok) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to store plan" }));
    return;
  }

  const data = await r.json() as { metadata?: { id?: string } };
  const id = data.metadata?.id;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ id }));
}
