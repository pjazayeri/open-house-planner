#!/usr/bin/env node
/**
 * Integration test for the full CSV upload → persist → reload flow.
 *
 * Steps:
 *  1. Get a Firebase ID token (same as test-api-user.mjs)
 *  2. Call /api/user  → get binId
 *  3. POST a real CSV to /api/ingest  → expect { csvUrl }
 *  4. GET /api/sync with auth headers → confirm csvUrl is saved in the user's bin
 *  5. Fetch the csvUrl directly → confirm the CSV is accessible
 *
 * Usage:
 *   node scripts/test-csv-upload.mjs <service-account.json> <firebase-web-api-key> [base-url]
 *
 * Examples:
 *   node scripts/test-csv-upload.mjs ~/Downloads/sa.json AIzaSy... https://open-house-planner.vercel.app
 *   node scripts/test-csv-upload.mjs ~/Downloads/sa.json AIzaSy... http://localhost:3000
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));

const [saPath, webApiKey, baseUrl = "https://open-house-planner.vercel.app"] = process.argv.slice(2);

if (!saPath || !webApiKey) {
  console.error("Usage: node scripts/test-csv-upload.mjs <service-account.json> <firebase-web-api-key> [base-url]");
  process.exit(1);
}

// --- 1. Firebase token (same flow as test-api-user.mjs) ---
const sa = JSON.parse(readFileSync(saPath, "utf8"));
console.log(`Service account: ${sa.project_id}`);
console.log(`Target:          ${baseUrl}\n`);

const admin = require("firebase-admin");
if (admin.apps.length === 0) admin.initializeApp({ credential: admin.credential.cert(sa) });

const TEST_UID = "integration-test-user";
let customToken;
try {
  customToken = await admin.auth().createCustomToken(TEST_UID);
  console.log("OK: custom token created");
} catch (e) {
  console.error("FAIL createCustomToken:", e.message); process.exit(1);
}

const exchangeUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`;
let idToken;
try {
  const r = await fetch(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const d = await r.json();
  if (!r.ok) { console.error("FAIL token exchange:", JSON.stringify(d)); process.exit(1); }
  idToken = d.idToken;
  console.log("OK: ID token obtained");
} catch (e) {
  console.error("FAIL token exchange:", e.message); process.exit(1);
}

// --- 2. /api/user → binId ---
console.log("\n=== Step 2: GET /api/user ===");
let binId;
try {
  const r = await fetch(`${baseUrl}/api/user`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await r.text();
  console.log(`Status: ${r.status}`);
  console.log(`Body:   ${body.slice(0, 200)}`);
  if (!r.ok) { console.error("FAIL: /api/user returned non-OK"); process.exit(1); }
  binId = JSON.parse(body).binId;
  console.log(`OK: binId = ${binId}`);
} catch (e) {
  console.error("FAIL /api/user:", e.message); process.exit(1);
}

// --- 3. POST CSV to /api/ingest ---
console.log("\n=== Step 3: POST /api/ingest ===");
// Use the real CSV from public/ for a realistic test
const csvPath = resolve(__dirname, "../public/redfin-favorites_2026-03-29T19-19-40.csv");
let csvText;
try {
  csvText = readFileSync(csvPath, "utf8");
  console.log(`Using CSV: ${csvPath.split("/").pop()} (${csvText.length} bytes)`);
} catch {
  // Fallback: minimal valid CSV
  csvText = "ADDRESS,CITY,STATE,ZIP,PRICE,BEDS,BATHS,SQFT,MLS#,STATUS\n123 Test St,San Francisco,CA,94102,500000,2,1,800,999TEST,Active";
  console.log("CSV not found, using minimal test CSV");
}

let csvUrl;
try {
  const r = await fetch(`${baseUrl}/api/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "text/csv",
      Authorization: `Bearer ${idToken}`,
      "X-Bin-Id": binId,
    },
    body: csvText,
  });
  const body = await r.text();
  console.log(`Status: ${r.status}`);
  console.log(`Body:   ${body.slice(0, 300)}`);
  if (!r.ok) { console.error("FAIL: /api/ingest returned non-OK"); process.exit(1); }
  csvUrl = JSON.parse(body).csvUrl;
  if (!csvUrl) { console.error("FAIL: response missing csvUrl"); process.exit(1); }
  console.log(`OK: csvUrl = ${csvUrl}`);
} catch (e) {
  console.error("FAIL /api/ingest:", e.message); process.exit(1);
}

// --- 4a. GET /api/sync → read current cloud state ---
console.log("\n=== Step 4a: GET /api/sync (read current cloud state) ===");
let currentState;
try {
  const r = await fetch(`${baseUrl}/api/sync`, {
    headers: { Authorization: `Bearer ${idToken}`, "X-Bin-Id": binId },
  });
  const body = await r.text();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.error("FAIL: /api/sync GET returned non-OK\n", body.slice(0, 200)); process.exit(1); }
  const state = JSON.parse(body);
  currentState = state.record ?? state;
  console.log(`Current csvUrl: ${currentState.csvUrl ?? "(none)"}`);
  console.log("OK: /api/sync GET working");
} catch (e) {
  console.error("FAIL /api/sync GET:", e.message); process.exit(1);
}

// --- 4b. PUT /api/sync → persist csvUrl (simulate cloudPatch) ---
console.log("\n=== Step 4b: PUT /api/sync (persist csvUrl) ===");
try {
  const merged = { ...currentState, csvUrl };
  const r = await fetch(`${baseUrl}/api/sync`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      "X-Bin-Id": binId,
    },
    body: JSON.stringify(merged),
  });
  const body = await r.text();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.error("FAIL: /api/sync PUT returned non-OK\n", body.slice(0, 200)); process.exit(1); }
  console.log("OK: csvUrl persisted to user's bin");
} catch (e) {
  console.error("FAIL /api/sync PUT:", e.message); process.exit(1);
}

// --- 4c. GET /api/sync again → confirm csvUrl is saved ---
console.log("\n=== Step 4c: GET /api/sync (confirm csvUrl saved) ===");
try {
  const r = await fetch(`${baseUrl}/api/sync`, {
    headers: { Authorization: `Bearer ${idToken}`, "X-Bin-Id": binId },
  });
  const body = await r.text();
  console.log(`Status: ${r.status}`);
  if (!r.ok) { console.error("FAIL: /api/sync GET returned non-OK\n", body.slice(0, 200)); process.exit(1); }
  const state = JSON.parse(body);
  const record = state.record ?? state;
  console.log(`csvUrl in cloud state: ${record.csvUrl ?? "(none)"}`);
  if (record.csvUrl === csvUrl) {
    console.log("OK: csvUrl correctly persisted");
  } else {
    console.error("FAIL: csvUrl mismatch or missing after PUT");
    console.error(`  expected: ${csvUrl}`);
    console.error(`  got:      ${record.csvUrl ?? "(none)"}`);
    process.exit(1);
  }
} catch (e) {
  console.error("FAIL /api/sync GET verify:", e.message); process.exit(1);
}

// --- 5. Fetch via /api/csv proxy with auth ---
console.log("\n=== Step 5: GET /api/csv (fetch CSV via proxy) ===");
const csvProxyUrl = csvUrl.startsWith("http") ? csvUrl : `${baseUrl}${csvUrl}`;
try {
  const r = await fetch(csvProxyUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  console.log(`Status: ${r.status}`);
  if (!r.ok) {
    const body = await r.text();
    console.error("FAIL: /api/csv returned non-OK\n", body.slice(0, 200));
    process.exit(1);
  }
  const text = await r.text();
  console.log(`OK: CSV accessible via proxy (${text.length} bytes)`);
  const firstLine = text.split("\n")[0];
  console.log(`First line: ${firstLine.slice(0, 80)}`);
} catch (e) {
  console.error("FAIL fetching csvUrl:", e.message); process.exit(1);
}

console.log("\nAll checks passed — upload → persist → reload flow is working correctly.");
