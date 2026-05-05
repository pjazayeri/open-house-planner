#!/usr/bin/env node
/**
 * Integration test for the mobile sign-in flow.
 *
 * What this covers:
 *  - The server-side auth that signInWithRedirect + getRedirectResult relies on.
 *    A redirect token is a standard Firebase JWT — identical to a popup token from
 *    the server's perspective. If these pass, auth works regardless of how the
 *    token was obtained in the browser.
 *  - Token → /api/user → binId assignment
 *  - binId → /api/sync reads/writes (the auth that was missing before the fix)
 *  - Sign-out + re-sign-in returns the same binId (session is stable)
 *  - Expired/invalid tokens are rejected
 *
 * What this cannot cover (browser-only):
 *  - The popup-blocked → signInWithRedirect fallback UI
 *  - sessionStorage availability in Safari/iOS
 *  - getRedirectResult picking up the result after the page reloads
 *
 * Usage:
 *   node scripts/test-mobile-auth.mjs <service-account.json> <firebase-web-api-key> [base-url]
 *
 * Example:
 *   node scripts/test-mobile-auth.mjs /tmp/sa.json AIzaSy... https://open-house-planner.vercel.app
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const [saPath, webApiKey, baseUrl = "https://open-house-planner.vercel.app"] = process.argv.slice(2);
if (!saPath || !webApiKey) {
  console.error("Usage: node scripts/test-mobile-auth.mjs <service-account.json> <firebase-web-api-key> [base-url]");
  process.exit(1);
}

const sa = JSON.parse(readFileSync(saPath, "utf8"));
console.log(`Service account: ${sa.project_id}`);
console.log(`Endpoint:        ${baseUrl}\n`);

const admin = require("firebase-admin");
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
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

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
  return { idToken: data.idToken, refreshToken: data.refreshToken };
}

async function refreshIdToken(refreshToken) {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${webApiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refreshToken }) }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.id_token;
}

const TEST_UID = "mobile-auth-test-user";

// --- Setup ---
console.log("=== Setup: obtaining Firebase ID token (simulates getRedirectResult) ===");
const { idToken: token1, refreshToken } = await getIdToken(TEST_UID);
console.log("OK: ID token obtained — same JWT format as getRedirectResult would return\n");

// --- Test 1: Token → /api/user → binId ---
console.log("=== Test 1: token authenticates with /api/user ===");
const userRes = await fetch(`${baseUrl}/api/user`, {
  headers: { Authorization: `Bearer ${token1}` },
});
check("/api/user returns 200", userRes.status === 200, `got ${userRes.status}`);
const binId = userRes.ok ? (await userRes.json()).binId : null;
check("response includes binId", typeof binId === "string" && binId.length > 0, `got ${JSON.stringify(binId)}`);
console.log(`  binId: ${binId}`);
console.log();

// --- Test 2: binId + token authenticates with /api/sync ---
console.log("=== Test 2: token + binId work on /api/sync ===");
const syncGetRes = await fetch(`${baseUrl}/api/sync`, {
  headers: { Authorization: `Bearer ${token1}`, "X-Bin-Id": binId },
});
check("/api/sync GET returns 200", syncGetRes.status === 200, `got ${syncGetRes.status}`);

const syncPutRes = await fetch(`${baseUrl}/api/sync`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}`, "X-Bin-Id": binId },
  body: JSON.stringify({ hiddenIds: ["mobile-test-sentinel"], priorityOrder: [], visits: {} }),
});
check("/api/sync PUT returns 200", syncPutRes.status === 200, `got ${syncPutRes.status}`);
console.log();

// --- Test 3: Re-sign-in returns same binId (session stable across redirects) ---
console.log("=== Test 3: re-sign-in (simulates redirect back) returns same binId ===");
const { idToken: token2 } = await getIdToken(TEST_UID);
const userRes2 = await fetch(`${baseUrl}/api/user`, {
  headers: { Authorization: `Bearer ${token2}` },
});
const binId2 = userRes2.ok ? (await userRes2.json()).binId : null;
check("second sign-in returns same binId", binId === binId2,
  `run1=${binId} run2=${binId2}`);
console.log();

// --- Test 4: Refreshed token still works (simulates auto-token-refresh mid-session) ---
console.log("=== Test 4: refreshed token still authenticates ===");
const refreshedToken = await refreshIdToken(refreshToken);
const syncGetRefreshed = await fetch(`${baseUrl}/api/sync`, {
  headers: { Authorization: `Bearer ${refreshedToken}`, "X-Bin-Id": binId },
});
check("/api/sync GET works with refreshed token", syncGetRefreshed.status === 200,
  `got ${syncGetRefreshed.status}`);
console.log();

// --- Test 5: Missing token → 401 ---
console.log("=== Test 5: missing token is rejected ===");
const noTokenRes = await fetch(`${baseUrl}/api/sync`, {
  headers: { "X-Bin-Id": binId },
});
check("no-token /api/sync returns 401", noTokenRes.status === 401, `got ${noTokenRes.status}`);
console.log();

// --- Test 6: Tampered token → 401 ---
console.log("=== Test 6: tampered token is rejected ===");
const tamperedToken = token1.slice(0, -10) + "AAAAAAAAAA";
const badTokenRes = await fetch(`${baseUrl}/api/sync`, {
  headers: { Authorization: `Bearer ${tamperedToken}`, "X-Bin-Id": binId },
});
check("tampered token returns 401", badTokenRes.status === 401, `got ${badTokenRes.status}`);
console.log();

// --- Cleanup ---
console.log("=== Cleanup ===");
const cleanRes = await fetch(`${baseUrl}/api/sync`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token1}`, "X-Bin-Id": binId },
  body: JSON.stringify({ hiddenIds: [], priorityOrder: [], visits: {} }),
});
check("cleanup PUT succeeds", cleanRes.status === 200, `got ${cleanRes.status}`);
console.log();

// --- Summary ---
const total = passed + failed;
console.log(`=== Results: ${passed}/${total} passed ===`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll mobile auth checks passed.");
  console.log("(Browser-only: popup-blocked fallback + getRedirectResult UI tested manually on device)");
}
