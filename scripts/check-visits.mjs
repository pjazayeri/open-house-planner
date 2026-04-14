#!/usr/bin/env node
/**
 * Audit cloud state: check that every visited listing has a snapshot.
 * For any that are missing, try to find the data in local CSV files and patch it in.
 *
 * Usage: node scripts/check-visits.mjs
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function readEnvLocal() {
  const content = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  return Object.fromEntries(
    content.split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        const raw = l.slice(i + 1).trim();
        const val = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
        return [l.slice(0, i).trim(), val];
      })
  );
}

const env = readEnvLocal();
const BIN_ID = env.JSONBIN_BIN_ID;
const API_KEY = env.JSONBIN_API_KEY;
const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const AUTH = { "X-Master-Key": API_KEY };

// Parse all CSVs in public/ and data/, index rows by MLS#
function loadAllCsvRows() {
  const byMls = new Map();
  for (const dir of ["public", "data"]) {
    const d = resolve(ROOT, dir);
    let files;
    try { files = readdirSync(d).filter((f) => f.startsWith("redfin-favorites_") && f.endsWith(".csv")).sort(); }
    catch { continue; }
    for (const f of files) {
      const text = readFileSync(resolve(d, f), "utf8");
      const lines = text.split("\n");
      if (lines.length < 2) continue;
      const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());
      const mlsIdx = headers.indexOf("MLS#");
      const addrIdx = headers.indexOf("ADDRESS");
      const urlIdx = headers.findIndex((h) => h.startsWith("URL (SEE"));
      const statusIdx = headers.indexOf("STATUS");
      const priceIdx = headers.indexOf("PRICE");
      const bedsIdx = headers.indexOf("BEDS");
      const bathsIdx = headers.indexOf("BATHS");
      const sqftIdx = headers.indexOf("SQUARE FEET");
      const hoaIdx = headers.indexOf("HOA/MONTH");
      const yrIdx = headers.indexOf("YEAR BUILT");
      const domIdx = headers.indexOf("DAYS ON MARKET");
      const ppsfIdx = headers.indexOf("$/SQUARE FEET");
      const cityIdx = headers.indexOf("CITY");
      const stateIdx = headers.indexOf("STATE OR PROVINCE");
      const zipIdx = headers.indexOf("ZIP OR POSTAL CODE");
      const locIdx = headers.indexOf("LOCATION");
      const typeIdx = headers.indexOf("PROPERTY TYPE");
      const ohStartIdx = headers.indexOf("NEXT OPEN HOUSE START TIME");
      const ohEndIdx = headers.indexOf("NEXT OPEN HOUSE END TIME");
      const latIdx = headers.indexOf("LATITUDE");
      const lngIdx = headers.indexOf("LONGITUDE");

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(",");
        const mls = cols[mlsIdx]?.trim();
        if (!mls) continue;
        if (!byMls.has(mls)) {
          // Keep first occurrence (earliest CSV = most likely the active listing)
          byMls.set(mls, {
            mls,
            address: cols[addrIdx]?.trim() ?? "",
            url: cols[urlIdx]?.trim() ?? "",
            status: cols[statusIdx]?.trim() ?? "",
            price: Number(cols[priceIdx]?.trim()) || 0,
            beds: Number(cols[bedsIdx]?.trim()) || 0,
            baths: Number(cols[bathsIdx]?.trim()) || 0,
            sqft: Number(cols[sqftIdx]?.trim()) || null,
            hoa: Number(cols[hoaIdx]?.trim()) || null,
            yearBuilt: Number(cols[yrIdx]?.trim()) || null,
            dom: Number(cols[domIdx]?.trim()) || null,
            ppsf: Number(cols[ppsfIdx]?.trim()) || null,
            city: cols[cityIdx]?.trim() ?? "",
            state: cols[stateIdx]?.trim() ?? "",
            zip: cols[zipIdx]?.trim() ?? "",
            location: cols[locIdx]?.trim() ?? "",
            propertyType: cols[typeIdx]?.trim() ?? "",
            ohStart: cols[ohStartIdx]?.trim() ?? "",
            ohEnd: cols[ohEndIdx]?.trim() ?? "",
            lat: Number(cols[latIdx]?.trim()) || 0,
            lng: Number(cols[lngIdx]?.trim()) || 0,
            csvFile: f,
          });
        }
      }
    }
  }
  return byMls;
}

// Redfin date like "March-14-2026 12:00 PM" → ISO string (Pacific time, assume UTC-7 for simplicity)
function parseRedfinDate(s) {
  if (!s) return null;
  try {
    const d = new Date(s.replace(/-/g, " "));
    if (isNaN(d.getTime())) return null;
    // Redfin times are in PT; offset by 7h to get approximate UTC
    return new Date(d.getTime() + 7 * 3600 * 1000).toISOString();
  } catch { return null; }
}

async function main() {
  if (!BIN_ID || !API_KEY) {
    console.error("Missing JSONBIN_BIN_ID or JSONBIN_API_KEY in .env.local");
    process.exit(1);
  }

  console.log("Fetching cloud state…");
  const getRes = await fetch(`${BIN_URL}/latest`, { headers: AUTH });
  if (!getRes.ok) { console.error(`GET failed: ${getRes.status}`); process.exit(1); }
  const { record } = await getRes.json();

  const visits = record.visits ?? {};
  const snapshots = record.listingSnapshots ?? {};
  const visitedIds = Object.keys(visits);

  console.log(`\nVisited listings: ${visitedIds.length}`);
  console.log(`Snapshots in cloud: ${Object.keys(snapshots).length}`);

  const missingSnapshot = visitedIds.filter((id) => !snapshots[id]);

  if (missingSnapshot.length === 0) {
    console.log("\n✅ All visited listings have snapshots — everything should show up in Past Visits.");
    return;
  }

  console.log(`\n⚠️  ${missingSnapshot.length} visited listing(s) missing snapshots:`);

  const csvRows = loadAllCsvRows();
  const toAdd = {};

  for (const id of missingSnapshot) {
    const row = csvRows.get(id);
    const v = visits[id];
    const visitedAt = v?.visitedAt ? new Date(v.visitedAt).toLocaleDateString() : "unknown date";
    if (!row) {
      console.log(`  ✗ ${id} — visited ${visitedAt}, NOT found in any CSV (cannot auto-restore)`);
      continue;
    }
    const ohStart = parseRedfinDate(row.ohStart);
    const ohEnd = parseRedfinDate(row.ohEnd);
    console.log(`  → ${id} (${row.address}) — visited ${visitedAt}, found in ${row.csvFile}`);
    toAdd[id] = {
      id,
      address: row.address,
      location: row.location,
      city: row.city,
      state: row.state,
      zip: row.zip,
      price: row.price,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft || null,
      yearBuilt: row.yearBuilt || null,
      daysOnMarket: row.dom || null,
      pricePerSqft: row.ppsf || null,
      hoa: row.hoa || null,
      propertyType: row.propertyType,
      openHouseStart: ohStart ?? new Date(0).toISOString(),
      openHouseEnd: ohEnd ?? new Date(0).toISOString(),
      url: row.url,
      lat: row.lat,
      lng: row.lng,
      capRate: 0,
      capRateBreakdown: {},
    };
  }

  if (Object.keys(toAdd).length === 0) {
    console.log("\nNo restorable snapshots found — manual data entry required for the above.");
    return;
  }

  console.log(`\nPatching ${Object.keys(toAdd).length} missing snapshot(s) into cloud state…`);
  const updated = {
    ...record,
    listingSnapshots: { ...snapshots, ...toAdd },
  };

  const putRes = await fetch(BIN_URL, {
    method: "PUT",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  if (!putRes.ok) { console.error(`PUT failed: ${putRes.status} ${await putRes.text()}`); process.exit(1); }

  console.log("✅ Done — reload the app to see all visited listings in Past Visits.");
}

main().catch((e) => { console.error(e); process.exit(1); });
