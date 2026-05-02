import type { IncomingMessage, ServerResponse } from "node:http";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const RENTCAST_API_KEY = process.env.RENTCAST_API_KEY;
  if (!RENTCAST_API_KEY) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not configured" }));
    return;
  }
  const qs = (req.url ?? "").split("?")[1] ?? "";
  const r = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${qs}`, {
    headers: { "X-Api-Key": RENTCAST_API_KEY },
  });
  res.writeHead(r.status, { "Content-Type": "application/json" });
  res.end(await r.text());
}
