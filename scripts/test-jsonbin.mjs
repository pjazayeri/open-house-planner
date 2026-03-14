#!/usr/bin/env node
/**
 * Tests JSONBin credentials from .env.local directly.
 * Run with: node scripts/test-jsonbin.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");

// Parse .env.local manually to avoid any loader quirks
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

console.log("=== Credential check ===");
console.log("JSONBIN_API_KEY:", API_KEY ? `${API_KEY.slice(0, 10)}... (len=${API_KEY.length})` : "MISSING");
console.log("JSONBIN_BIN_ID: ", BIN_ID ? `${BIN_ID} (len=${BIN_ID.length})` : "MISSING");
console.log("Key bytes (hex):", Buffer.from(API_KEY ?? "").slice(0, 12).toString("hex"), "...");

if (!API_KEY || !BIN_ID) {
  console.error("\n❌ Missing credentials — check .env.local");
  process.exit(1);
}

const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}/latest`;
console.log(`\n=== GET ${BIN_URL} ===`);

const res = await fetch(BIN_URL, {
  headers: { "X-Master-Key": API_KEY },
});

console.log(`Status: ${res.status} ${res.statusText}`);
console.log(`Content-Type: ${res.headers.get("content-type")}`);

const body = await res.text();
console.log(`Body (first 400 chars):\n${body.slice(0, 400)}`);

if (res.ok) {
  console.log("\n✅ JSONBin credentials are valid and bin is accessible");
} else {
  console.error("\n❌ JSONBin returned an error — credentials may be wrong or bin ID mismatched");
  process.exit(1);
}
