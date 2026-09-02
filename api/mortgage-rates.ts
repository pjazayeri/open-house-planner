import type { IncomingMessage, ServerResponse } from "node:http";

// Freddie Mac PMMS weekly average rates, via FRED. Proxied server-side
// because FRED sends no Access-Control-Allow-Origin header, so a browser
// fetch of fredgraph.csv always fails CORS. Mirrored in vite.config.ts.
const SERIES = { 30: "MORTGAGE30US", 15: "MORTGAGE15US" } as const;

async function latest(id: string): Promise<{ value: number; date: string } | null> {
  const r = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`);
  if (!r.ok) return null;
  // CSV is "DATE,VALUE" rows; FRED writes "." for a missing observation.
  const lines = (await r.text()).trim().split("\n").filter((l) => l && !l.startsWith("DATE") && !l.endsWith(",."));
  const last = lines[lines.length - 1];
  if (!last) return null;
  const [date, raw] = last.split(",");
  const value = parseFloat(raw);
  return !isNaN(value) && value > 0 ? { value, date } : null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.writeHead(405); res.end("Method not allowed"); return;
  }
  try {
    const [r30, r15] = await Promise.all([latest(SERIES[30]), latest(SERIES[15])]);
    if (!r30 && !r15) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "FRED unavailable" }));
      return;
    }
    // PMMS publishes weekly (Thursdays); let the CDN hold it for 6h.
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    });
    res.end(JSON.stringify({ 30: r30?.value ?? null, 15: r15?.value ?? null, asOf: r30?.date ?? r15?.date ?? null }));
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : "FRED fetch failed" }));
  }
}
