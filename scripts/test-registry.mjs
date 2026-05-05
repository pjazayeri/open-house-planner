#!/usr/bin/env node
/**
 * Tests JSONBin registry bin read/write directly (no Firebase auth needed).
 * Reads JSONBIN_API_KEY and JSONBIN_REGISTRY_BIN_ID from .env.local.
 *
 * Usage:
 *   node scripts/test-registry.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

// Parse .env.local manually (same approach as vite.config.ts)
const envPath = resolve(process.cwd(), ".env.local");
let envText;
try {
  envText = readFileSync(envPath, "utf8");
} catch {
  console.error("FAIL: cannot read .env.local — run `vercel env pull .env.local` first");
  process.exit(1);
}

function readEnvVar(text, key) {
  const match = text.match(new RegExp(`^${key}="?([^"\n\\\\]+(?:\\\\n[^"\n\\\\]*)*)"?`, "m"));
  if (!match) return null;
  // Unescape \n sequences
  return match[1].replace(/\\n/g, "").trim();
}

const API_KEY = readEnvVar(envText, "JSONBIN_API_KEY");
const REGISTRY_BIN_ID = readEnvVar(envText, "JSONBIN_REGISTRY_BIN_ID");

if (!API_KEY) {
  console.error("FAIL: JSONBIN_API_KEY not found in .env.local");
  process.exit(1);
}
if (!REGISTRY_BIN_ID) {
  console.error("FAIL: JSONBIN_REGISTRY_BIN_ID not found in .env.local");
  process.exit(1);
}

console.log(`Registry bin: ${REGISTRY_BIN_ID}`);
console.log(`API key:      ${API_KEY.slice(0, 10)}...\n`);

const binUrl = `https://api.jsonbin.io/v3/b/${REGISTRY_BIN_ID}`;
const headers = { "X-Master-Key": API_KEY, "Content-Type": "application/json" };

// --- Step 1: GET current registry ---
console.log("=== Step 1: GET registry ===");
let registry;
const getRes = await fetch(`${binUrl}/latest`, { headers });
const getBody = await getRes.text();
console.log(`Status: ${getRes.status} ${getRes.statusText}`);
console.log(`Body:   ${getBody.slice(0, 300)}`);
if (!getRes.ok) {
  console.error("\nFAIL: GET failed — check JSONBIN_REGISTRY_BIN_ID and JSONBIN_API_KEY");
  process.exit(1);
}
try {
  const data = JSON.parse(getBody);
  registry = data.record ?? {};
  console.log(`\nCurrent registry has ${Object.keys(registry).length} entries`);
} catch {
  console.error("\nFAIL: could not parse GET response as JSON");
  process.exit(1);
}

// --- Step 2: PUT with a test entry ---
console.log("\n=== Step 2: PUT registry (add test entry) ===");
const testKey = "__registry_test__";
const newRegistry = { ...registry, [testKey]: { binId: "test-bin-id", createdAt: new Date().toISOString() } };
const putRes = await fetch(binUrl, {
  method: "PUT",
  headers,
  body: JSON.stringify(newRegistry),
});
const putBody = await putRes.text();
console.log(`Status: ${putRes.status} ${putRes.statusText}`);
console.log(`Body:   ${putBody.slice(0, 300)}`);
if (!putRes.ok) {
  console.error("\nFAIL: PUT failed — registry cannot be written");
  process.exit(1);
}

// --- Step 3: GET again to verify persistence ---
console.log("\n=== Step 3: GET registry (verify write persisted) ===");
const verifyRes = await fetch(`${binUrl}/latest`, { headers });
const verifyBody = await verifyRes.text();
console.log(`Status: ${verifyRes.status} ${verifyRes.statusText}`);
if (!verifyRes.ok) {
  console.error("\nFAIL: second GET failed");
  process.exit(1);
}
const verifyData = JSON.parse(verifyBody);
const verifyRegistry = verifyData.record ?? {};
if (verifyRegistry[testKey]?.binId === "test-bin-id") {
  console.log("OK: test entry found in registry after write");
} else {
  console.error("FAIL: test entry NOT found — write appeared to succeed but did not persist!");
  console.error("Registry after write:", JSON.stringify(verifyRegistry, null, 2).slice(0, 500));
  process.exit(1);
}

// --- Step 4: Clean up (restore original) ---
console.log("\n=== Step 4: PUT registry (remove test entry) ===");
const cleanRes = await fetch(binUrl, {
  method: "PUT",
  headers,
  body: JSON.stringify(registry),
});
console.log(`Status: ${cleanRes.status} ${cleanRes.statusText}`);
if (!cleanRes.ok) {
  console.warn("WARN: cleanup PUT failed — test entry may remain in registry");
} else {
  console.log("OK: registry restored to original state");
}

console.log("\nAll checks passed — JSONBin registry is readable and writable.");
