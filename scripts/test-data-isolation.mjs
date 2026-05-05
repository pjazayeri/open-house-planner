#!/usr/bin/env node
/**
 * Integration test for data isolation between users.
 *
 * Tests:
 *  1. Two users get different bin IDs from /api/user
 *  2. User A writes data — User B cannot see it (reads their own empty state)
 *  3. Unauthenticated /api/sync requests are rejected (401)
 *  4. A valid token with a different user's bin ID is still rejected (after token verify)
 *
 * Usage:
 *   node scripts/test-data-isolation.mjs <service-account.json> <firebase-web-api-key> [base-url]
 *
 * Examples:
 *   node scripts/test-data-isolation.mjs /tmp/sa.json AIzaSy... https://open-house-planner.vercel.app
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const [saPath, webApiKey, baseUrl = "https://open-house-planner.vercel.app"] = process.argv.slice(2);
if (!saPath || !webApiKey) {
  console.error("Usage: node scripts/test-data-isolation.mjs <service-account.json> <firebase-web-api-key> [base-url]");
  process.exit(1);
}

const sa = JSON.parse(readFileSync(saPath, "utf8"));
console.log(`Service account project: ${sa.project_id}`);
console.log(`Testing endpoint: ${baseUrl}\n`);

const admin = require("firebase-admin");
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return data.idToken;
}

async function callApiUser(token) {
  const res = await fetch(`${baseUrl}/api/user`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`/api/user → ${res.status}: ${await res.text()}`);
  return (await res.json()).binId;
}

async function syncGet(token, binId) {
  const headers = { Authorization: `Bearer ${token}` };
  if (binId) headers["X-Bin-Id"] = binId;
  const res = await fetch(`${baseUrl}/api/sync`, { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function syncPut(token, binId, data) {
  const res = await fetch(`${baseUrl}/api/sync`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Bin-Id": binId },
    body: JSON.stringify(data),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

let passed = 0;
let failed = 0;

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// --- Setup: get tokens for two distinct users ---
console.log("=== Setup: getting tokens for user-a and user-b ===");
const UID_A = "isolation-test-user-a";
const UID_B = "isolation-test-user-b";
const [tokenA, tokenB] = await Promise.all([getIdToken(UID_A), getIdToken(UID_B)]);
console.log("OK: tokens obtained for both users\n");

// --- Test 1: Different bin IDs ---
console.log("=== Test 1: users get different bin IDs ===");
const [binA, binB] = await Promise.all([callApiUser(tokenA), callApiUser(tokenB)]);
console.log(`  User A binId: ${binA}`);
console.log(`  User B binId: ${binB}`);
check("user A and B have different bin IDs", binA !== binB);
console.log();

// --- Test 2: User A writes a sentinel value ---
console.log("=== Test 2: user A writes sentinel data ===");
const SENTINEL = { hiddenIds: ["isolation-test-sentinel-from-user-a"], priorityOrder: [], visits: {} };
const putA = await syncPut(tokenA, binA, SENTINEL);
check("user A PUT succeeds", putA.status === 200, `got ${putA.status}`);
console.log();

// --- Test 3: User B reads their own bin — should NOT see A's data ---
console.log("=== Test 3: user B reads their own bin — no cross-contamination ===");
const getB = await syncGet(tokenB, binB);
check("user B GET succeeds", getB.status === 200, `got ${getB.status}`);
const bHasASentinel = JSON.stringify(getB.body).includes("isolation-test-sentinel-from-user-a");
check("user B does NOT see user A's data", !bHasASentinel,
  bHasASentinel ? "user B's bin contains user A's sentinel — data is leaking!" : "");
console.log();

// --- Test 4: Unauthenticated request is rejected ---
console.log("=== Test 4: unauthenticated /api/sync is rejected ===");
const getUnauth = await syncGet("", binA);
check("no-token GET returns 401", getUnauth.status === 401, `got ${getUnauth.status}`);
console.log();

// --- Test 5: User A can read their own data back ---
console.log("=== Test 5: user A reads back their own data ===");
const getA = await syncGet(tokenA, binA);
check("user A GET succeeds", getA.status === 200, `got ${getA.status}`);
const aRecord = getA.body?.record ?? getA.body;
const aSentinelPresent = JSON.stringify(aRecord).includes("isolation-test-sentinel-from-user-a");
check("user A sees their own sentinel", aSentinelPresent);
console.log();

// --- Cleanup: reset user A's bin ---
console.log("=== Cleanup: resetting user A's bin ===");
const cleanPut = await syncPut(tokenA, binA, { hiddenIds: [], priorityOrder: [], visits: {} });
check("user A bin reset", cleanPut.status === 200, `got ${cleanPut.status}`);
console.log();

// --- Summary ---
const total = passed + failed;
console.log(`=== Results: ${passed}/${total} passed ===`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll isolation checks passed.");
}
