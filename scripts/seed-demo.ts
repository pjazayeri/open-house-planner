#!/usr/bin/env tsx
/**
 * Creates the demo plan bin from a Redfin CSV and posts it to /api/share.
 * The returned bin ID should be hardcoded as DEMO_BIN_ID in AuthScreen.tsx.
 *
 * Usage:
 *   npx tsx scripts/seed-demo.ts <csv-path> [base-url]
 *
 * Example:
 *   npx tsx scripts/seed-demo.ts ~/Downloads/redfin.csv https://open-house-planner.vercel.app
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const [csvPath, baseUrl = "https://open-house-planner.vercel.app"] = process.argv.slice(2);

if (!csvPath) {
  console.error("Usage: npx tsx scripts/seed-demo.ts <csv-path> [base-url]");
  process.exit(1);
}

// --- Parse CSV ---
function parseCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

const csvText = readFileSync(resolve(csvPath), "utf8");
const lines = csvText.split("\n").filter(l => l.trim());
const headers = parseCsvLine(lines[0]);
const idx = (name: string) => headers.findIndex(h => h.trim().toLowerCase().includes(name.toLowerCase()));

const COL = {
  saleType:   idx("SALE TYPE"),
  status:     idx("STATUS"),
  address:    idx("ADDRESS"),
  city:       idx("CITY"),
  state:      idx("STATE"),
  zip:        idx("ZIP"),
  price:      idx("PRICE"),
  beds:       idx("BEDS"),
  baths:      idx("BATHS"),
  sqft:       idx("SQUARE FEET"),
  location:   idx("LOCATION"),
  hoa:        idx("HOA"),
  yearBuilt:  idx("YEAR BUILT"),
  lat:        idx("LATITUDE"),
  lng:        idx("LONGITUDE"),
  url:        idx("URL"),
  mls:        idx("MLS#"),
  ohStart:    idx("NEXT OPEN HOUSE START TIME"),
  ohEnd:      idx("NEXT OPEN HOUSE END TIME"),
};

function parseDate(s: string): Date | null {
  if (!s.trim()) return null;
  // "May-10-2026 02:00 PM"
  const d = new Date(s.replace(/-/g, " "));
  return isNaN(d.getTime()) ? null : d;
}

const now = new Date();
const rows = lines.slice(1).map(line => parseCsvLine(line));

const listings = rows
  .filter(r => r[COL.status]?.trim() === "Active")
  .map(r => {
    const start = parseDate(r[COL.ohStart]);
    const end = parseDate(r[COL.ohEnd]);
    if (!start || !end) return null;

    const price = parseInt(r[COL.price]?.replace(/[^0-9]/g, "")) || 0;
    const sqft = parseInt(r[COL.sqft]?.replace(/[^0-9]/g, "")) || null;
    const beds = parseFloat(r[COL.beds]) || 0;
    const baths = parseFloat(r[COL.baths]) || 0;
    const hoa = parseInt(r[COL.hoa]?.replace(/[^0-9]/g, "")) || null;
    const lat = parseFloat(r[COL.lat]) || 0;
    const lng = parseFloat(r[COL.lng]) || 0;
    const id = r[COL.mls]?.trim() || `${r[COL.address]?.trim()}-${r[COL.city]?.trim()}`;

    // Rough cap rate estimate (matches app logic: assume 0.6% monthly rent ratio)
    const monthlyRent = price * 0.006;
    const annualIncome = monthlyRent * 12;
    const annualExpenses = (hoa ?? 0) * 12 + price * 0.012; // HOA + 1.2% expenses
    const capRate = price > 0 ? ((annualIncome - annualExpenses) / price) * 100 : 0;

    return {
      id,
      addr: r[COL.address]?.trim() ?? "",
      loc: r[COL.location]?.trim() ?? "",
      city: r[COL.city]?.trim() ?? "",
      price, beds, baths, sqft, hoa,
      start: start.toISOString(),
      end: end.toISOString(),
      url: r[COL.url]?.trim() ?? "",
      cap: Math.round(capRate * 100) / 100,
      lat, lng,
      _start: start,
    };
  })
  .filter((l): l is NonNullable<typeof l> => l !== null && l._start > now);

if (listings.length === 0) {
  console.error("No active listings with future open houses found in the CSV.");
  console.error("Open house dates in this CSV may all be in the past.");
  process.exit(1);
}

console.log(`Found ${listings.length} listings with future open houses`);

// --- Group by time slot (same start time) ---
const groups = new Map<string, typeof listings>();
for (const l of listings) {
  const key = l.start;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(l);
}

const plan = Array.from(groups.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, ls]) => {
    const start = ls[0]._start;
    const endDate = new Date(ls[0].end);
    const label = start.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
      + " · " + start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return {
      label,
      start: ls[0].start,
      end: ls[0].end,
      listings: ls.map(({ _start: _, ...rest }) => rest),
    };
  });

console.log(`\nPlan groups:`);
for (const g of plan) {
  console.log(`  ${g.label} — ${g.listings.length} listing(s)`);
  for (const l of g.listings) console.log(`    ${l.addr}, ${l.city} ($${l.price.toLocaleString()})`);
}

// --- POST to /api/share ---
console.log(`\nPosting to ${baseUrl}/api/share ...`);
const res = await fetch(`${baseUrl}/api/share`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(plan),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`FAIL: /api/share returned ${res.status}: ${body}`);
  process.exit(1);
}

const data = await res.json() as { id?: string };
if (!data.id) {
  console.error("FAIL: no id in response:", JSON.stringify(data));
  process.exit(1);
}

console.log(`\nOK: demo bin created`);
console.log(`Bin ID: ${data.id}`);
console.log(`\nNow set in src/components/Auth/AuthScreen.tsx:`);
console.log(`  const DEMO_BIN_ID = "${data.id}";`);
console.log(`\nPreview: ${baseUrl}/#share?bin=${data.id}`);
