#!/usr/bin/env node
/**
 * Tests Firebase Admin SDK setup.
 *
 * Usage (recommended — handles multi-line/escaped values correctly):
 *   node --env-file=.env.local scripts/test-firebase-admin.mjs
 *
 * Or pass a real Firebase ID token to also test verifyIdToken:
 *   node --env-file=.env.local scripts/test-firebase-admin.mjs "eyJhbGc..."
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const expectedProjectId = process.env.VITE_FIREBASE_PROJECT_ID;

console.log("=== Firebase Admin credential check ===\n");
console.log("FIREBASE_SERVICE_ACCOUNT_JSON :", jsonEnv ? `present (len=${jsonEnv.length})` : "MISSING");
console.log("VITE_FIREBASE_PROJECT_ID      :", expectedProjectId || "MISSING");

if (!jsonEnv) {
  console.error("\nFAIL: FIREBASE_SERVICE_ACCOUNT_JSON not set.");
  console.error("Run as: node --env-file=.env.local scripts/test-firebase-admin.mjs");
  process.exit(1);
}

// --- Parse: try base64 first, fall back to plain JSON ---
let sa;
try {
  const decoded = Buffer.from(jsonEnv, "base64").toString("utf8");
  sa = JSON.parse(decoded);
  if (typeof sa.project_id !== "string") throw new Error("no project_id after base64 decode");
  console.log("\nParsed as: base64-encoded JSON");
} catch {
  try {
    sa = JSON.parse(jsonEnv);
    console.log("\nParsed as: raw JSON");
  } catch (e) {
    console.error("\nFAIL: could not parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
    process.exit(1);
  }
}

console.log("project_id   :", sa.project_id);
console.log("client_email :", sa.client_email);
console.log("private_key  :", sa.private_key ? `present (starts with ${sa.private_key.slice(0, 27)}...)` : "MISSING");

// --- Project ID match ---
if (expectedProjectId) {
  if (sa.project_id !== expectedProjectId) {
    console.error(`\nFAIL: project_id MISMATCH`);
    console.error(`  service account : ${sa.project_id}`);
    console.error(`  VITE env var    : ${expectedProjectId}`);
    console.error("  Tokens from the client app cannot be verified by this service account.");
    process.exit(1);
  }
  console.log(`\nOK: project_id matches VITE_FIREBASE_PROJECT_ID (${sa.project_id})`);
}

// --- Initialize Firebase Admin ---
const admin = require("firebase-admin");
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  console.log("OK: Firebase Admin initialized");
} catch (e) {
  console.error("\nFAIL: initializeApp threw:", e.message);
  process.exit(1);
}

// --- listUsers: proves the key can talk to Firebase ---
console.log("\n=== Testing Firebase Auth API (listUsers) ===");
try {
  const result = await admin.auth().listUsers(1);
  console.log(`OK: listUsers() succeeded — ${result.users.length} user(s) returned`);
} catch (e) {
  console.error("FAIL: listUsers() threw:", e.message);
  console.error("  The service account may be for the wrong project or the key may be revoked.");
  process.exit(1);
}

// --- Optional: verify a real token ---
const token = process.argv[2];
if (token) {
  console.log("\n=== Testing verifyIdToken ===");
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("OK: token verified");
    console.log("  uid   :", decoded.uid);
    console.log("  email :", decoded.email ?? "(none)");
  } catch (e) {
    console.error("FAIL: verifyIdToken threw:", e.message);
    process.exit(1);
  }
} else {
  console.log("\n(Tip: pass a Firebase ID token as an argument to also test verifyIdToken)");
}

console.log("\nAll checks passed — Firebase Admin is correctly configured.");
