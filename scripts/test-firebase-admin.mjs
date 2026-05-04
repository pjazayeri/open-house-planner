#!/usr/bin/env node
/**
 * Tests Firebase Admin SDK setup.
 *
 * Pass the service account JSON file directly (most reliable):
 *   node scripts/test-firebase-admin.mjs path/to/service-account.json
 *
 * Or read from an env variable (if already set in the shell):
 *   FIREBASE_SERVICE_ACCOUNT_JSON=$(cat sa.json) node scripts/test-firebase-admin.mjs
 */
import { readFileSync, existsSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// --- Load service account ---
let sa;
const arg = process.argv[2];

if (arg && existsSync(arg)) {
  // Passed as a file path
  console.log(`Reading service account from file: ${arg}\n`);
  sa = JSON.parse(readFileSync(arg, "utf8"));
} else {
  // Fall back to env var
  const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!jsonEnv) {
    console.error("Usage: node scripts/test-firebase-admin.mjs path/to/service-account.json");
    console.error("   or: FIREBASE_SERVICE_ACCOUNT_JSON=$(cat sa.json) node scripts/test-firebase-admin.mjs");
    process.exit(1);
  }
  console.log(`Reading service account from env var (len=${jsonEnv.length})\n`);
  try {
    // Try base64 first, then plain JSON
    const decoded = Buffer.from(jsonEnv, "base64").toString("utf8");
    sa = JSON.parse(decoded);
    if (typeof sa.project_id !== "string") throw new Error();
  } catch {
    sa = JSON.parse(jsonEnv);
  }
}

console.log("=== Service account ===");
console.log("project_id   :", sa.project_id);
console.log("client_email :", sa.client_email);
console.log("private_key  :", sa.private_key ? `present (starts with ${sa.private_key.slice(0, 27)}...)` : "MISSING");

if (!sa.project_id || !sa.client_email || !sa.private_key) {
  console.error("\nFAIL: service account is missing required fields");
  process.exit(1);
}

// --- Initialize Firebase Admin ---
const admin = require("firebase-admin");
try {
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  console.log("\nOK: Firebase Admin initialized");
} catch (e) {
  console.error("\nFAIL: initializeApp threw:", e.message);
  process.exit(1);
}

// --- listUsers: proves the key can actually talk to Firebase ---
console.log("\n=== Testing Firebase Auth API (listUsers) ===");
try {
  const result = await admin.auth().listUsers(1);
  console.log(`OK: listUsers() succeeded — ${result.users.length} user(s) returned`);
} catch (e) {
  console.error("FAIL:", e.message);
  process.exit(1);
}

console.log("\nAll checks passed — service account is valid.");
console.log("Deploy with: vercel --prod");
