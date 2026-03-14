/**
 * Uploads local public/thumbnails/*.jpg to Vercel Blob storage.
 * Skips files that are already in Blob.
 *
 * Usage: node scripts/upload-thumbnails.mjs
 * Requires: .env.local with BLOB_READ_WRITE_TOKEN
 */

import { put, list } from "@vercel/blob";
import { readdir, readFile } from "fs/promises";
import { readFileSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THUMB_DIR = join(ROOT, "public", "thumbnails");
const ENV_FILE = join(ROOT, ".env.local");

// Load .env.local so BLOB_READ_WRITE_TOKEN is available
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    process.env[key] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
}

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Missing BLOB_READ_WRITE_TOKEN — run: vercel env pull .env.local");
  process.exit(1);
}

let files;
try {
  files = (await readdir(THUMB_DIR)).filter((f) => f.endsWith(".jpg"));
} catch {
  console.error(`No thumbnails found at ${THUMB_DIR}`);
  console.error("Run: python3 scripts/fetch-thumbnails.py");
  process.exit(1);
}

console.log(`Found ${files.length} local thumbnails`);

const existing = await list({ prefix: "thumbnails/" });
const existingIds = new Set(
  existing.blobs.map((b) => b.pathname.replace("thumbnails/", "").replace(".jpg", ""))
);
console.log(`${existingIds.size} already in Blob storage`);

let uploaded = 0;
let skipped = 0;

for (const file of files) {
  const id = basename(file, ".jpg");
  if (existingIds.has(id)) {
    skipped++;
    continue;
  }
  const buf = await readFile(join(THUMB_DIR, file));
  await put(`thumbnails/${id}.jpg`, buf, {
    access: "private",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });
  console.log(`  ✓  ${id}`);
  uploaded++;
}

console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped`);
