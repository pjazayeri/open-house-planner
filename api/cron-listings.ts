// Cron ingester: pulls SF open-house listings from Redfin's regional gis-csv
// and upserts them into the shared Neon catalog (listings + open_houses).
//
// Scheduled daily via vercel.json `crons`. Vercel sends
// `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set; we require it.
// Same bearer works for a manual trigger.
//
// See docs/research-open-house-data.md for why this source/approach.
import type { IncomingMessage, ServerResponse } from "node:http";
import { neon } from "@neondatabase/serverless";

// NOTE: kept in sync with src/utils/addressKey.ts. Vercel transpiles each api/
// file and resolves imports at runtime — it does NOT bundle cross-directory
// src/ imports into the lambda — so the server needs its own copy of this
// dependency-free normalizer. (addressKey.test.ts covers the canonical copy.)
const STREET_SUFFIX_MAP: Array<[RegExp, string]> = [
  [/\bstreet\b/g, "st"], [/\bst\.?\b/g, "st"],
  [/\bavenue\b/g, "ave"], [/\bave\.?\b/g, "ave"],
  [/\bboulevard\b/g, "blvd"], [/\bblvd\.?\b/g, "blvd"],
  [/\broad\b/g, "rd"], [/\brd\.?\b/g, "rd"],
  [/\bdrive\b/g, "dr"], [/\bdr\.?\b/g, "dr"],
  [/\bplace\b/g, "pl"], [/\bpl\.?\b/g, "pl"],
];
function addressKey(addressRaw: string, city: string): string {
  let a = addressRaw.trim().toLowerCase()
    .replace(/\./g, "").replace(/[\s,]+/g, " ").replace(/\bunit\s+/g, "#");
  for (const [pattern, replacement] of STREET_SUFFIX_MAP) a = a.replace(pattern, replacement);
  a = a.replace(/\s+/g, " ").trim();
  return `${a}|${city.trim().toLowerCase()}`;
}

// Minimal RFC-4180 CSV parser. (PapaParse references browser globals at load
// time and crashes the serverless function, so we parse inline instead.)
function parseCsvObjects(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\r") {
      // ignore
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows
    .slice(1)
    .filter((r) => r.length > 1)
    .map((r) => {
      const o: Row = {};
      header.forEach((h, idx) => { o[h] = r[idx]; });
      return o;
    });
}

const BASE = "https://www.redfin.com/stingray/api/gis-csv";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// San Francisco. (Multi-market would parameterize region_id/region_type.)
const REGION = { region_id: "17151", region_type: "6", market: "sanfrancisco" };
const PAGE_SIZE = 350;
const MAX_PAGES = 6;
const CHUNK = 50; // statements per Neon transaction round-trip

type Row = Record<string, string | undefined>;

function gisUrl(page: number): string {
  const p = new URLSearchParams({
    al: "1", market: REGION.market, num_homes: String(PAGE_SIZE),
    ord: "redfin-recommended-asc", page_number: String(page),
    region_id: REGION.region_id, region_type: REGION.region_type,
    sf: "1,2,3,5,6,7", status: "9", uipt: "1,2,3,4,5,6,7,8", v: "8",
  });
  return `${BASE}?${p.toString()}`;
}

function num(v: string | undefined): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}
const int = (v: string | undefined): number | null => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
// Redfin: "May-28-2026 04:30 PM" → "2026-05-28 16:30:00" (24h wall-clock, no tz).
// Stored via `::timestamp AT TIME ZONE 'America/Los_Angeles'` so Postgres applies
// the correct PST/PDT offset.
function toLocalSqlTs(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^([A-Za-z]{3,})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!mon) return null;
  let h = parseInt(m[4], 10) % 12;
  if (m[6].toUpperCase() === "PM") h += 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${m[3]}-${pad(mon)}-${pad(parseInt(m[2], 10))} ${pad(h)}:${m[5]}:00`;
}

async function fetchPage(page: number): Promise<Row[]> {
  const r = await fetch(gisUrl(page), { headers: { "User-Agent": UA, Accept: "text/csv,*/*" } });
  if (!r.ok) throw new Error(`gis-csv page ${page} → HTTP ${r.status}`);
  return parseCsvObjects(await r.text());
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const secret = process.env.CRON_SECRET;
  const auth = (req.headers["authorization"] as string) ?? "";
  if (secret && auth !== `Bearer ${secret}`) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "DATABASE_URL not configured" }));
    return;
  }
  const sql = neon(DATABASE_URL);
  const started = Date.now();

  try {
    // 1. Fetch + dedupe by address_key (pagination stops when a page adds nothing
    //    new — robust whether or not page_number actually paginates).
    const byKey = new Map<string, Row>();
    let pages = 0;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const rows = await fetchPage(page);
      if (rows.length === 0) break;
      let added = 0;
      for (const r of rows) {
        const k = addressKey(r.ADDRESS ?? "", r.CITY ?? "");
        if (!k || k === "|") continue;
        if (!byKey.has(k)) { byKey.set(k, r); added++; }
      }
      pages++;
      if (added === 0 || rows.length < PAGE_SIZE) break;
    }

    // 2. Build upserts.
    const urlKeyOf = (r: Row) => Object.keys(r).find((k) => k.startsWith("URL"));
    const queries: ReturnType<typeof sql>[] = [];
    let withOpenHouse = 0;
    for (const [k, r] of byKey) {
      const urlKey = urlKeyOf(r);
      queries.push(sql`
        INSERT INTO listings (
          address_key, mls_id, address, city, state, zip, price, beds, baths, sqft,
          lot_size, year_built, days_on_market, price_per_sqft, hoa, property_type,
          location, status, url, lat, lng, raw, source, last_seen
        ) VALUES (
          ${k}, ${r["MLS#"] ?? null}, ${r.ADDRESS ?? null}, ${r.CITY ?? null},
          ${r["STATE OR PROVINCE"] ?? null}, ${r["ZIP OR POSTAL CODE"] ?? null},
          ${num(r.PRICE)}, ${num(r.BEDS)}, ${num(r.BATHS)}, ${int(r["SQUARE FEET"])},
          ${int(r["LOT SIZE"])}, ${int(r["YEAR BUILT"])}, ${int(r["DAYS ON MARKET"])},
          ${num(r["$/SQUARE FEET"])}, ${num(r["HOA/MONTH"])}, ${r["PROPERTY TYPE"] ?? null},
          ${r.LOCATION ?? null}, ${r.STATUS ?? null}, ${urlKey ? (r[urlKey] ?? null) : null},
          ${num(r.LATITUDE)}, ${num(r.LONGITUDE)}, ${JSON.stringify(r)}::jsonb,
          'redfin-gis-csv', now()
        )
        ON CONFLICT (address_key) DO UPDATE SET
          mls_id = EXCLUDED.mls_id, address = EXCLUDED.address, city = EXCLUDED.city,
          state = EXCLUDED.state, zip = EXCLUDED.zip, price = EXCLUDED.price,
          beds = EXCLUDED.beds, baths = EXCLUDED.baths, sqft = EXCLUDED.sqft,
          lot_size = EXCLUDED.lot_size, year_built = EXCLUDED.year_built,
          days_on_market = EXCLUDED.days_on_market, price_per_sqft = EXCLUDED.price_per_sqft,
          hoa = EXCLUDED.hoa, property_type = EXCLUDED.property_type, location = EXCLUDED.location,
          status = EXCLUDED.status, url = EXCLUDED.url, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
          raw = EXCLUDED.raw, source = EXCLUDED.source, last_seen = now()
      `);

      const startRaw = r["NEXT OPEN HOUSE START TIME"];
      if (startRaw && startRaw.trim()) {
        withOpenHouse++;
        const endRaw = r["NEXT OPEN HOUSE END TIME"] ?? null;
        queries.push(sql`
          INSERT INTO open_houses (address_key, mls_id, start_raw, end_raw, start_ts, end_ts, source)
          VALUES (
            ${k}, ${r["MLS#"] ?? null}, ${startRaw}, ${endRaw},
            ${toLocalSqlTs(startRaw)}::timestamp AT TIME ZONE 'America/Los_Angeles',
            ${toLocalSqlTs(endRaw ?? undefined)}::timestamp AT TIME ZONE 'America/Los_Angeles',
            'redfin-gis-csv'
          )
          ON CONFLICT (address_key, start_raw) DO NOTHING
        `);
      }
    }

    // 3. Execute in chunked transactions; measure row deltas for the summary.
    const [{ l: lBefore }] = (await sql`SELECT count(*)::int AS l FROM listings`) as { l: number }[];
    const [{ o: ohBefore }] = (await sql`SELECT count(*)::int AS o FROM open_houses`) as { o: number }[];
    for (let i = 0; i < queries.length; i += CHUNK) {
      await sql.transaction(queries.slice(i, i + CHUNK));
    }
    const [{ l: lAfter }] = (await sql`SELECT count(*)::int AS l FROM listings`) as { l: number }[];
    const [{ o: ohAfter }] = (await sql`SELECT count(*)::int AS o FROM open_houses`) as { o: number }[];

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      pagesFetched: pages,
      uniqueListings: byKey.size,
      listingsWithOpenHouse: withOpenHouse,
      listingsTotalNow: lAfter,
      listingsAdded: lAfter - lBefore,
      openHousesTotalNow: ohAfter,
      openHousesAdded: ohAfter - ohBefore,
      ms: Date.now() - started,
    }, null, 2));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(e), ms: Date.now() - started }));
  }
}
