#!/usr/bin/env node
/**
 * Tests Firebase Admin SDK setup from .env.local.
 * Run with: node scripts/test-firebase-admin.mjs
 *
 * Optionally pass a real Firebase ID token to also test verifyIdToken:
 *   node scripts/test-firebase-admin.mjs "eyJhbGc..."
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");

// Parse .env.local (same raw approach as test-jsonbin.mjs)
const raw = readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  raw.split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      const v = l.slice(i + 1).trim();
      return [l.slice(0, i).trim(), v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v];
    })
);

const jsonEnv = env.FIREBASE_SERVICE_ACCOUNT_JSON;
const expectedProjectId = env.VITE_FIREBASE_PROJECT_ID;

console.log("=== Firebase Admin credential check ===\n");
console.log("FIREBASE_SERVICE_ACCOUNT_JSON :", jsonEnv ? `present (len=${jsonEnv.length})` : "MISSING");
console.log("VITE_FIREBASE_PROJECT_ID      :", expectedProjectId || "MISSING");

if (!jsonEnv) {
  console.error("\nFAIL: FIREBASE_SERVICE_ACCOUNT_JSON not found in .env.local");
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

// --- Project ID match check ---
if (expectedProjectId) {
  if (sa.project_id !== expectedProjectId) {
    console.error(`\nFAIL: project_id MISMATCH`);
    console.error(`  service account : ${sa.project_id}`);
    console.error(`  VITE env var    : ${expectedProjectId}`);
    console.error("  Tokens issued by the client app cannot be verified by this service account.");
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

// --- listUsers(1): proves the key can actually talk to Firebase ---
console.log("\n=== Testing Firebase Auth API call (listUsers) ===");
try {
  const result = await admin.auth().listUsers(1);
  console.log(`OK: listUsers() succeeded — ${result.users.length} user(s) returned`);
} catch (e) {
  console.error("FAIL: listUsers() threw:", e.message);
  console.error("  The service account JSON may be for the wrong project or the key may be revoked.");
  process.exit(1);
}

// --- Optional: verify a real ID token passed as argv ---
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
