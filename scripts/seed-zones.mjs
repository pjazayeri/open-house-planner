#!/usr/bin/env node
/**
 * Seeds starter map zones for SF neighborhoods into the JSONBin cloud state.
 * Run with: node scripts/seed-zones.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");

const raw = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  raw.split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      const rawVal = l.slice(i + 1).trim();
      const val = rawVal.startsWith('"') && rawVal.endsWith('"') ? rawVal.slice(1, -1) : rawVal;
      return [l.slice(0, i).trim(), val];
    })
);

const API_KEY = env.JSONBIN_API_KEY;
const BIN_ID = env.JSONBIN_BIN_ID;
const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

if (!API_KEY || !BIN_ID) {
  console.error("❌ Missing JSONBIN_API_KEY or JSONBIN_BIN_ID in .env.local");
  process.exit(1);
}

// ── Starter zone polygons ──────────────────────────────────────
// Coordinates are [lat, lng]. These approximate real SF neighborhood
// boundaries — drag vertices in the app to refine.
const STARTER_ZONES = [
  {
    id: "zone-pac-heights",
    name: "Pacific Heights",
    color: "#3b82f6",
    polygon: [
      [37.7979, -122.4470],  // NW  Broadway & Lyon
      [37.7979, -122.4215],  // NE  Broadway & Van Ness
      [37.7878, -122.4215],  // SE  California & Van Ness
      [37.7878, -122.4470],  // SW  California & Lyon
    ],
  },
  {
    id: "zone-russian-hill",
    name: "Russian Hill",
    color: "#22c55e",
    polygon: [
      [37.8055, -122.4230],  // NW  Francisco & Hyde
      [37.8055, -122.4090],  // NE  Francisco & Mason
      [37.7975, -122.4090],  // SE  Broadway & Mason
      [37.7975, -122.4230],  // SW  Broadway & Hyde
    ],
  },
  {
    id: "zone-lower-pac-heights",
    name: "Lower Pac Heights",
    color: "#f97316",
    polygon: [
      [37.7878, -122.4470],  // NW  California & Lyon/Divisadero
      [37.7878, -122.4215],  // NE  California & Van Ness
      [37.7815, -122.4215],  // SE  Bush & Van Ness
      [37.7815, -122.4470],  // SW  Bush & Divisadero
    ],
  },
  {
    id: "zone-nopa",
    name: "NOPA",
    color: "#a855f7",
    polygon: [
      [37.7800, -122.4510],  // NW  McAllister & Baker
      [37.7800, -122.4370],  // NE  McAllister & Divisadero
      [37.7730, -122.4370],  // SE  Fell & Divisadero
      [37.7730, -122.4510],  // SW  Fell & Baker
    ],
  },
  {
    id: "zone-soma-rincon",
    name: "SoMa / Rincon Hill",
    color: "#ef4444",
    polygon: [
      [37.7790, -122.4070],  // NW  Market & 8th
      [37.7790, -122.3870],  // NE  Market & Embarcadero
      [37.7680, -122.3870],  // SE  Bryant & Embarcadero
      [37.7680, -122.4070],  // SW  Bryant & 8th
    ],
  },
];

// ── Fetch current state ────────────────────────────────────────
console.log("Fetching current cloud state…");
const getRes = await fetch(`${BIN_URL}/latest`, {
  headers: { "X-Master-Key": API_KEY },
});

if (!getRes.ok) {
  console.error(`❌ GET failed: ${getRes.status} ${getRes.statusText}`);
  process.exit(1);
}

const { record: current } = await getRes.json();
console.log(`✓ Fetched. Existing zones: ${(current.mapZones ?? []).length}`);

// Merge: keep any existing zones that don't conflict with starter IDs,
// then append the starters (overwriting if same ID).
const existingNonStarter = (current.mapZones ?? []).filter(
  (z) => !STARTER_ZONES.some((s) => s.id === z.id)
);
const merged = { ...current, mapZones: [...existingNonStarter, ...STARTER_ZONES] };

// ── Write back ─────────────────────────────────────────────────
console.log(`Writing ${merged.mapZones.length} zone(s)…`);
const putRes = await fetch(BIN_URL, {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    "X-Master-Key": API_KEY,
  },
  body: JSON.stringify(merged),
});

if (!putRes.ok) {
  const body = await putRes.text();
  console.error(`❌ PUT failed: ${putRes.status}\n${body.slice(0, 200)}`);
  process.exit(1);
}

console.log("✅ Zones seeded successfully:");
STARTER_ZONES.forEach((z) => console.log(`   ${z.color}  ${z.name}`));
console.log("\nOpen the app and click the zone button on the map to see them.");
console.log("Drag vertex handles to refine the boundaries.");
