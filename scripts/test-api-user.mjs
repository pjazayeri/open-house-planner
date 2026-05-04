#!/usr/bin/env node
/**
 * Integration test for /api/user — no mocking, uses real Firebase tokens.
 *
 * The script:
 *  1. Reads your service account JSON
 *  2. Creates a custom Firebase token (server-side, no browser needed)
 *  3. Exchanges it for a real ID token via Firebase REST API
 *  4. Calls /api/user with that token and prints the result
 *
 * Usage:
 *   node scripts/test-api-user.mjs <service-account.json> <firebase-web-api-key> [base-url]
 *
 * Examples:
 *   # against production
 *   node scripts/test-api-user.mjs ~/Downloads/sa.json AIzaSy... https://open-house-planner.vercel.app
 *
 *   # against local vercel dev (run `vercel dev` in another terminal first)
 *   node scripts/test-api-user.mjs ~/Downloads/sa.json AIzaSy... http://localhost:3000
 */
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const [saPath, webApiKey, baseUrl = "https://open-house-planner.vercel.app"] = process.argv.slice(2);

if (!saPath || !webApiKey) {
  console.error("Usage: node scripts/test-api-user.mjs <service-account.json> <firebase-web-api-key> [base-url]");
  console.error("  firebase-web-api-key is VITE_FIREBASE_API_KEY (starts with AIza...)");
  process.exit(1);
}

// --- 1. Load service account ---
const sa = JSON.parse(readFileSync(saPath, "utf8"));
console.log(`Service account project: ${sa.project_id}`);
console.log(`Testing endpoint: ${baseUrl}/api/user\n`);

// --- 2. Init Firebase Admin + create custom token ---
const admin = require("firebase-admin");
if (admin.apps.length === 0) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const TEST_UID = "integration-test-user";
let customToken;
try {
  customToken = await admin.auth().createCustomToken(TEST_UID);
  console.log("OK: custom token created");
} catch (e) {
  console.error("FAIL: createCustomToken threw:", e.message);
  process.exit(1);
}

// --- 3. Exchange custom token for a real ID token via Firebase REST API ---
const exchangeUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`;
let idToken;
try {
  const res = await fetch(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("FAIL: token exchange failed:", JSON.stringify(data));
    process.exit(1);
  }
  idToken = data.idToken;
  console.log("OK: ID token obtained (real Firebase token)");
} catch (e) {
  console.error("FAIL: token exchange threw:", e.message);
  process.exit(1);
}

// --- 4. Call /api/user with the real token ---
console.log("\n=== Calling /api/user ===");
try {
  const res = await fetch(`${baseUrl}/api/user`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await res.text();
  console.log(`Status: ${res.status} ${res.statusText}`);
  console.log(`Body:   ${body.slice(0, 300)}`);

  if (res.ok) {
    console.log("\nAll checks passed — /api/user is working correctly.");
  } else {
    console.error("\nFAIL: /api/user returned non-OK status.");
    if (res.status === 401) {
      console.error("  → Firebase token verification is failing on the server.");
      console.error("  → Check that FIREBASE_SERVICE_ACCOUNT_JSON in Vercel matches project:", sa.project_id);
    }
    process.exit(1);
  }
} catch (e) {
  console.error("FAIL: fetch threw:", e.message);
  process.exit(1);
}
