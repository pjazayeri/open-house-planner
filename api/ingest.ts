import type { IncomingMessage, ServerResponse } from "node:http";
import { put, list, del } from "@vercel/blob";

let adminInitialized = false;

async function getUidFromToken(token: string): Promise<string | null> {
  if (process.env.SKIP_AUTH_VERIFY === "true") return "dev-user";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin") as typeof import("firebase-admin");
    if (!adminInitialized && admin.apps.length === 0) {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!json) return null;
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(Buffer.from(json, "base64").toString())) });
      adminInitialized = true;
    }
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const OG_IMAGE_RE = /og:image"\s+content="([^"]+)"/;

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function fetchOgImage(listingUrl: string): Promise<string | null> {
  try {
    const res = await fetch(listingUrl, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(15000),
    });
    const html = await res.text();
    const match = OG_IMAGE_RE.exec(html);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function storeThumbnail(mlsId: string, imageUrl: string): Promise<void> {
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) return; // sanity check
  await put(`thumbnails/${mlsId}.jpg`, buf, {
    access: "private",
    contentType: "image/jpeg",
    addRandomSuffix: false,
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const headers = corsHeaders();

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, headers);
    res.end("Method not allowed");
    return;
  }

  // Read CSV body
  const csvText = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  if (!csvText.trim()) {
    res.writeHead(400, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify({ error: "Empty CSV body" }));
    return;
  }

  // Determine per-user or shared path
  const authHeader = (req.headers["authorization"] as string) ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const uid = token ? await getUidFromToken(token) : null;
  const csvPrefix = uid ? `csv/${uid}/` : "csv/";
  const csvPath = `${csvPrefix}redfin-favorites_latest.csv`;

  // Store CSV to Blob (public so client can fetch directly via stored URL)
  const csvBlob = await put(csvPath, csvText, {
    access: "public",
    contentType: "text/csv",
    addRandomSuffix: false,
  });

  // Delete previous CSVs for this user (keep only the latest)
  const allCsvBlobs = await list({ prefix: csvPrefix });
  const oldCsvBlobs = allCsvBlobs.blobs.filter((b) => b.pathname !== csvBlob.pathname);
  if (oldCsvBlobs.length > 0) {
    await del(oldCsvBlobs.map((b) => b.url));
  }

  // Parse rows to find active listings with open houses
  const lines = csvText.split("\n");
  if (lines.length < 2) {
    res.writeHead(200, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify({ csvUrl: csvBlob.url, thumbnails: { fetched: 0, skipped: 0, failed: 0 }, deleted: 0 }));
    return;
  }

  const headerLine = lines[0];
  const headers2 = headerLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const statusIdx = headers2.indexOf("STATUS");
  const mlsIdx = headers2.indexOf("MLS#");
  const urlIdx = headers2.findIndex((h) => h.startsWith("URL (SEE"));

  const activeIds = new Set<string>();
  const activeListings: { mlsId: string; url: string }[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Simple CSV split (values may be quoted)
    const cols = line.split(",");
    const status = cols[statusIdx]?.trim() ?? "";
    const mlsId = cols[mlsIdx]?.trim() ?? "";
    const url = cols[urlIdx]?.trim() ?? "";
    if (status === "Active" && mlsId && url) {
      activeIds.add(mlsId);
      activeListings.push({ mlsId, url });
    }
  }

  // Get all existing thumbnail blobs
  const existingThumbBlobs = await list({ prefix: "thumbnails/" });
  const existingIds = new Set(
    existingThumbBlobs.blobs.map((b) => b.pathname.replace("thumbnails/", "").replace(".jpg", ""))
  );

  // Fetch thumbnails for new listings not already in Blob
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (const { mlsId, url } of activeListings) {
    if (existingIds.has(mlsId)) {
      skipped++;
      continue;
    }
    const ogUrl = await fetchOgImage(url);
    if (!ogUrl) {
      failed++;
      continue;
    }
    try {
      await storeThumbnail(mlsId, ogUrl);
      fetched++;
    } catch {
      failed++;
    }
    // Small delay to be polite
    await new Promise((r) => setTimeout(r, 500));
  }

  // Delete thumbnail blobs for listings no longer in the active set
  const staleBlobs = existingThumbBlobs.blobs.filter((b) => {
    const id = b.pathname.replace("thumbnails/", "").replace(".jpg", "");
    return !activeIds.has(id);
  });
  if (staleBlobs.length > 0) {
    await del(staleBlobs.map((b) => b.url));
  }

  res.writeHead(200, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify({
    csvUrl: csvBlob.url,
    thumbnails: { fetched, skipped, failed },
    deleted: staleBlobs.length,
  }));
}
