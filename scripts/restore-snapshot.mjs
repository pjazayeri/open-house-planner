#!/usr/bin/env node
/**
 * Restore a listing snapshot to cloud state (JSONBin) so it appears in Past Visits.
 * Usage: node scripts/restore-snapshot.mjs
 *
 * This is a one-off utility — edit the LISTING_DATA object below if needed.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Read credentials from .env.local
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

// Listing data from the March 13 CSV (MLS 426110056)
const LISTING_DATA = {
  id: "426110056",
  address: "2060 Sutter St #502",
  location: "",
  city: "San Francisco",
  state: "CA",
  zip: "94115",
  price: 1198000,
  beds: 2,
  baths: 2.0,
  sqft: 998,
  yearBuilt: 1984,
  daysOnMarket: 1,
  pricePerSqft: 1200,
  hoa: 905,
  propertyType: "Condo/Co-op",
  openHouseStart: "2026-03-14T20:00:00.000Z", // March 14 12:00 PM PT
  openHouseEnd: "2026-03-14T22:00:00.000Z",   // March 14  2:00 PM PT
  url: "https://www.redfin.com/CA/San-Francisco/2060-Sutter-St-94115/unit-502/home/1634731",
  lat: 37.7861255,
  lng: -122.4343893,
  capRate: 0,
  capRateBreakdown: {},
};

async function main() {
  if (!BIN_ID || !API_KEY) {
    console.error("Missing JSONBIN_BIN_ID or JSONBIN_API_KEY in .env.local");
    process.exit(1);
  }

  console.log("Fetching current cloud state…");
  const getRes = await fetch(`${BIN_URL}/latest`, { headers: AUTH });
  if (!getRes.ok) {
    console.error(`GET failed: ${getRes.status} ${await getRes.text()}`);
    process.exit(1);
  }
  const { record } = await getRes.json();

  const existing = record.listingSnapshots?.[LISTING_DATA.id];
  if (existing) {
    console.log(`Snapshot for ${LISTING_DATA.id} already exists — no change needed.`);
    return;
  }

  const updated = {
    ...record,
    listingSnapshots: {
      ...(record.listingSnapshots ?? {}),
      [LISTING_DATA.id]: LISTING_DATA,
    },
  };

  console.log(`Adding snapshot for ${LISTING_DATA.id} (${LISTING_DATA.address})…`);
  const putRes = await fetch(BIN_URL, {
    method: "PUT",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(updated),
  });
  if (!putRes.ok) {
    console.error(`PUT failed: ${putRes.status} ${await putRes.text()}`);
    process.exit(1);
  }

  console.log("Done! Reload the app — the listing will appear in Browse → Past Visits.");
}

main().catch((e) => { console.error(e); process.exit(1); });
