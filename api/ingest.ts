import type { IncomingMessage, ServerResponse } from "node:http";
import { put, list, del } from "@vercel/blob";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let adminInitialized = false;

async function getUidFromToken(token: string): Promise<string | null> {
  if (process.env.SKIP_AUTH_VERIFY === "true") return "dev-user";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin") as typeof import("firebase-admin");
    if (!adminInitialized && admin.apps.length === 0) {
      const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (!json) return null;
      let serviceAccount: unknown;
      try {
        const decoded = Buffer.from(json, "base64").toString("utf8");
        serviceAccount = JSON.parse(decoded);
        if (typeof (serviceAccount as Record<string, unknown>).project_id !== "string") throw new Error();
      } catch {
        serviceAccount = JSON.parse(json);
      }
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount as Parameters<typeof admin.credential.cert>[0]) });
      adminInitialized = true;
    }
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
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
  console.log("[ingest] auth header present:", !!token, "csv bytes:", csvText.length);
  const uid = token ? await getUidFromToken(token) : null;
  console.log("[ingest] uid:", uid ?? "(none)");
  const csvPrefix = uid ? `csv/${uid}/` : "csv/";
  const csvPath = `${csvPrefix}redfin-favorites_latest.csv`;

  // Store CSV to Blob (private — served via /api/csv proxy)
  let csvBlob: Awaited<ReturnType<typeof put>>;
  try {
    csvBlob = await put(csvPath, csvText, {
      access: "private",
      contentType: "text/csv",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    console.log("[ingest] blob put ok:", csvBlob.url);
  } catch (err) {
    console.error("[ingest] blob put failed:", err);
    res.writeHead(500, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify({ error: "Failed to store CSV", detail: String(err) }));
    return;
  }

  // Delete previous CSVs for this user (keep only the latest)
  try {
    const allCsvBlobs = await list({ prefix: csvPrefix });
    const oldCsvBlobs = allCsvBlobs.blobs.filter((b) => b.pathname !== csvBlob.pathname);
    if (oldCsvBlobs.length > 0) await del(oldCsvBlobs.map((b) => b.url));
  } catch (err) {
    console.warn("[ingest] blob cleanup failed (non-fatal):", err);
  }

  // Return the fixed proxy URL — client fetches CSV via /api/csv with auth headers
  res.writeHead(200, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify({ csvUrl: "/api/csv" }));
}
