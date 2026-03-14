import { list, head } from "@vercel/blob";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, ".env.local");
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const raw = line.slice(i + 1).trim();
    process.env[key] = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
}

const testIds = ["426110536", "426094389", "426097331", "426108943", "OC26042925"];

const { blobs } = await list({ prefix: "thumbnails/" });
console.log("Total blobs with thumbnails/ prefix:", blobs.length);
console.log("\nFirst 5 pathnames:", blobs.slice(0, 5).map(b => b.pathname));

console.log("\nChecking current listing IDs:");
for (const id of testIds) {
  const found = blobs.find(b => b.pathname === `thumbnails/${id}.jpg`);
  console.log(`  thumbnails/${id}.jpg:`, found ? "✓ EXISTS" : "✗ NOT FOUND");
}

console.log("\nTrying head() for first test ID:");
try {
  const r = await head("thumbnails/426110536.jpg");
  console.log("  SUCCESS:", r.pathname);
} catch(e) {
  console.log("  FAILED:", e.message);
}
