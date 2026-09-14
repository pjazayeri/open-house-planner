// GET /api/listings — serves the shared open-house catalog (Neon) to the client.
// Returns the soonest upcoming open house per normalized address, so the app can
// overlay fresh times onto a user's (possibly stale) uploaded favorites.
//
// GET /api/listings?catalog=1 additionally returns `catalog`: the full Redfin-
// shaped row for every listing with an upcoming open house (times filled in
// from open_houses), so the phone can browse + favorite listings without a CSV.
//
// Auth-gated like /api/sync (the data is public, but we don't want an open
// anonymous endpoint on the deployment).
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "module";
import { neon } from "@neondatabase/serverless";
const require = createRequire(import.meta.url);

let adminInitialized = false;
async function getFirebaseAdmin() {
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
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    adminInitialized = true;
  }
  return admin;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Catalog not configured" }));
    return;
  }

  // Require a valid Firebase ID token in production (same gate as /api/sync).
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.SKIP_AUTH_VERIFY !== "true") {
    const authHeader = (req.headers["authorization"] as string) ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }
    try {
      const admin = await getFirebaseAdmin();
      if (admin) await admin.auth().verifyIdToken(token);
    } catch {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }
  }

  const sql = neon(DATABASE_URL);
  // Soonest still-upcoming open house per address.
  const rows = (await sql`
    SELECT DISTINCT ON (address_key) address_key, start_raw, end_raw, mls_id
    FROM open_houses
    WHERE start_ts IS NOT NULL AND start_ts > now()
    ORDER BY address_key, start_ts ASC
  `) as { address_key: string; start_raw: string; end_raw: string | null; mls_id: string | null }[];

  const openHouses: Record<string, { start: string; end: string | null; mlsId: string | null }> = {};
  for (const r of rows) {
    openHouses[r.address_key] = { start: r.start_raw, end: r.end_raw, mlsId: r.mls_id };
  }

  const wantCatalog = new URL(req.url ?? "/", "http://x").searchParams.get("catalog") === "1";
  let catalog: { addressKey: string; row: Record<string, string> }[] | undefined;
  if (wantCatalog) {
    // `raw` is the ingested Redfin CSV row (same headers as a favorites export),
    // so the client can feed it straight through parse → filter → capRate.
    const full = (await sql`
      SELECT DISTINCT ON (l.address_key) l.address_key, l.raw, o.start_raw, o.end_raw
      FROM open_houses o
      JOIN listings l USING (address_key)
      WHERE o.start_ts IS NOT NULL AND o.start_ts > now() AND l.raw IS NOT NULL
      ORDER BY l.address_key, o.start_ts ASC
    `) as { address_key: string; raw: Record<string, string>; start_raw: string; end_raw: string | null }[];
    catalog = full.map((r) => ({
      addressKey: r.address_key,
      row: { ...r.raw, "NEXT OPEN HOUSE START TIME": r.start_raw, "NEXT OPEN HOUSE END TIME": r.end_raw ?? "" },
    }));
  }

  res.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=300", // open-house times change at most daily
  });
  res.end(JSON.stringify({ openHouses, count: rows.length, ...(catalog ? { catalog } : {}) }));
}
