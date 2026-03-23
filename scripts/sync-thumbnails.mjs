#!/usr/bin/env node
/**
 * Sync thumbnails: pull the CSV from Vercel Blob, find all active listings,
 * fetch any thumbnails missing from Blob, upload them.
 *
 * Usage: node scripts/sync-thumbnails.mjs
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { list, put } from "@vercel/blob";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local
const envFile = join(ROOT, ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    process.env[key] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
}

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
if (!TOKEN) { console.error("BLOB_READ_WRITE_TOKEN missing"); process.exit(1); }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// 1. Fetch latest CSV from Blob
console.log("Fetching latest CSV from Vercel Blob...");
const { blobs: csvBlobs } = await list({ prefix: "csv/redfin-favorites_" });
if (!csvBlobs.length) { console.error("No CSV found in Blob"); process.exit(1); }
const latestCsv = csvBlobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).at(-1);
console.log(`  Using: ${latestCsv.pathname}`);
const csvText = await fetch(latestCsv.url, { headers: { Authorization: `Bearer ${TOKEN}` } }).then(r => r.text());

// 2. Parse all active listings from CSV
const lines = csvText.trim().split("\n");
const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
const statusIdx = headers.indexOf("STATUS");
const mlsIdx = headers.indexOf("MLS#");
const urlIdx = headers.findIndex(h => h.startsWith("URL (SEE"));

const listings = [];
for (const line of lines.slice(1)) {
  if (!line.trim()) continue;
  const cols = line.split(",");
  const status = cols[statusIdx]?.trim() ?? "";
  const mlsId = cols[mlsIdx]?.trim() ?? "";
  const url = cols[urlIdx]?.trim() ?? "";
  if (status === "Active" && mlsId && url) listings.push({ mlsId, url });
}
console.log(`  Found ${listings.length} active listings`);

// 3. Check which thumbnails are already in Blob
const { blobs: thumbBlobs } = await list({ prefix: "thumbnails/" });
const existing = new Set(thumbBlobs.map(b => b.pathname.replace("thumbnails/", "").replace(".jpg", "")));
console.log(`  ${existing.size} thumbnails already in Blob`);

const missing = listings.filter(l => !existing.has(l.mlsId));
console.log(`  ${missing.length} missing thumbnails to fetch\n`);

if (missing.length === 0) { console.log("All thumbnails up to date!"); process.exit(0); }

// 4. Fetch and upload missing thumbnails
const OG_RE = /og:image"\s+content="([^"]+)"/;
let fetched = 0, failed = 0;

for (const { mlsId, url } of missing) {
  process.stdout.write(`FETCH ${mlsId} ... `);
  try {
    const html = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) }).then(r => r.text());
    const ogUrl = OG_RE.exec(html)?.[1];
    if (!ogUrl) { console.log("FAIL (no og:image)"); failed++; continue; }

    const img = await fetch(ogUrl, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!img.ok) { console.log(`FAIL (image ${img.status})`); failed++; continue; }
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 1000) { console.log("FAIL (too small)"); failed++; continue; }

    await put(`thumbnails/${mlsId}.jpg`, buf, { access: "private", contentType: "image/jpeg", addRandomSuffix: false });
    console.log("OK");
    fetched++;
  } catch (e) {
    console.log(`FAIL (${e.message})`);
    failed++;
  }
  await new Promise(r => setTimeout(r, 800));
}

console.log(`\nDone. Fetched: ${fetched}, Failed: ${failed}`);
