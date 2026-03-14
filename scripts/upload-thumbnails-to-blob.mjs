#!/usr/bin/env node
/**
 * Uploads all public/thumbnails/*.jpg to Vercel Blob.
 * Run once to migrate existing thumbnails to cloud storage.
 * Usage: node scripts/upload-thumbnails-to-blob.mjs
 */
import { readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { put } from "@vercel/blob";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dir, "..");

// Load BLOB_READ_WRITE_TOKEN from .env.local
const envRaw = readFileSync(resolve(root, ".env.local"), "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      const raw = l.slice(i + 1).trim();
      const val = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
      return [l.slice(0, i).trim(), val];
    })
);

process.env.BLOB_READ_WRITE_TOKEN = env.BLOB_READ_WRITE_TOKEN;

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("❌ BLOB_READ_WRITE_TOKEN missing from .env.local");
  process.exit(1);
}

const thumbDir = resolve(root, "public", "thumbnails");
const files = readdirSync(thumbDir).filter((f) => f.endsWith(".jpg"));
console.log(`Uploading ${files.length} thumbnails to Vercel Blob...`);

let ok = 0, failed = 0;
for (const file of files) {
  const buf = readFileSync(resolve(thumbDir, file));
  try {
    const { url } = await put(`thumbnails/${file}`, buf, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
    });
    console.log(`  ✓ ${file} → ${url}`);
    ok++;
  } catch (e) {
    console.error(`  ✗ ${file}: ${e.message}`);
    failed++;
  }
}

console.log(`\nDone. Uploaded: ${ok}, Failed: ${failed}`);
