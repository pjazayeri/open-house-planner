#!/usr/bin/env node
/**
 * One-time script to inject a manually specified listing into the cloud
 * listingSnapshots so it appears in Data and Finance pages even after
 * being removed from the active CSV.
 *
 * Usage: node scripts/inject-listing.mjs
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
      const raw = l.slice(i + 1).trim();
      const val = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
      return [l.slice(0, i).trim(), val];
    })
);

const API_KEY = env.JSONBIN_API_KEY;
const BIN_ID = env.JSONBIN_BIN_ID;
const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ── Listing to inject ────────────────────────────────────────────────────────
const price = 1329000, sqft = 1421, hoa = 784;
const annualGrossRent = sqft * 4.00 * 12;               // SF avg $4/sqft
const propertyTax = price * 0.011;
const insurance = price * 0.0015;                        // HO-6 condo
const vacancy = annualGrossRent * 0.05;
const maintenanceBeforeHoa = annualGrossRent * 0.12;     // pre-1940 → 12%
const maintenance = maintenanceBeforeHoa * 0.40;         // condo HOA -60%
const annualHoa = hoa * 12;
const totalExpenses = propertyTax + insurance + vacancy + maintenance + annualHoa;
const noi = annualGrossRent - totalExpenses;
const capRate = Math.round(Math.max(0, (noi / price) * 100) * 100) / 100;

const listing = {
  id: "426108943",
  address: "2299 Sacramento St #16",
  location: "Pacific Heights",
  city: "San Francisco", state: "CA", zip: "94115",
  price, beds: 2, baths: 1, sqft, yearBuilt: 1913,
  daysOnMarket: null, pricePerSqft: Math.round(price / sqft), hoa,
  propertyType: "Condo/Co-op",
  openHouseStart: "2026-03-22T19:00:00.000Z",
  openHouseEnd: "2026-03-22T21:00:00.000Z",
  url: "https://www.redfin.com/CA/San-Francisco/2299-Sacramento-St-94115/unit-16/home/1779850",
  lat: 37.7900379, lng: -122.4305203,
  capRate,
  capRateBreakdown: {
    rentPsf: 4.00, rentPsfSource: "San Francisco avg",
    effectiveSqft: sqft, sqftImputed: false,
    propertyTypeMultiplier: 1.0, units: 1, monthlyRent: sqft * 4.00,
    propertyTax, insurance, insuranceLabel: "HO-6 condo",
    vacancy, maintenanceRate: 0.12, maintenanceBeforeHoa, maintenance,
    hoaReductionLabel: "-60% (condo HOA)", management: 0, annualHoa,
    annualGrossRent, totalExpenses, noi, capRate,
  },
};

// ── Fetch → merge → PUT ──────────────────────────────────────────────────────
console.log(`Fetching current state from JSONBin...`);
const getRes = await fetch(`${BIN_URL}/latest`, { headers: { "X-Master-Key": API_KEY } });
if (!getRes.ok) { console.error("GET failed:", getRes.status, await getRes.text()); process.exit(1); }
const { record } = await getRes.json();

const listingSnapshots = { ...(record.listingSnapshots ?? {}), [listing.id]: listing };
console.log(`Merging snapshot for ${listing.address} (MLS# ${listing.id})...`);

const putRes = await fetch(BIN_URL, {
  method: "PUT",
  headers: { "X-Master-Key": API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ ...record, listingSnapshots }),
});
if (!putRes.ok) { console.error("PUT failed:", putRes.status, await putRes.text()); process.exit(1); }

console.log(`✅ Done. ${listing.address} | $${price.toLocaleString()} | capRate: ${capRate}%`);
console.log(`   Reload the app — it will appear in Data and Finance pages.`);
