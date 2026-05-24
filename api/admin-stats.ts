// GET /api/admin-stats — observability for the owner: live data-volume across
// every storage dependency (Neon DB, Vercel Blob, Firebase Auth) plus catalog
// health. Metered services with no clean usage API (Vercel bandwidth/functions,
// Neon compute/egress, Anthropic, RentCast) are shown as reference + links in
// the client, not here.
//
// Admin-gated: valid Firebase token AND uid in ADMIN_UIDS (comma-separated env).
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "module";
import { neon } from "@neondatabase/serverless";
import { list } from "@vercel/blob";
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

async function settle<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string }> {
  try {
    return { value: await fn() };
  } catch (e) {
    return { error: String(e) };
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  // --- auth: valid token + uid in ADMIN_UIDS ---
  const adminUids = (process.env.ADMIN_UIDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const authHeader = (req.headers["authorization"] as string) ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.SKIP_AUTH_VERIFY !== "true") {
    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }
    let uid: string;
    try {
      const admin = await getFirebaseAdmin();
      if (!admin) throw new Error("admin unavailable");
      uid = (await admin.auth().verifyIdToken(token)).uid;
    } catch {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }
    if (adminUids.length > 0 && !adminUids.includes(uid)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not an admin" }));
      return;
    }
  }

  const DATABASE_URL = process.env.DATABASE_URL;

  // --- Neon: db size, per-table sizes + exact row counts, catalog health ---
  const neonStats = await settle(async () => {
    if (!DATABASE_URL) throw new Error("DATABASE_URL not configured");
    const sql = neon(DATABASE_URL);
    const [{ db_bytes }] = (await sql`SELECT pg_database_size(current_database())::bigint AS db_bytes`) as { db_bytes: string }[];
    const sizes = (await sql`
      SELECT c.relname AS name, pg_total_relation_size(c.oid)::bigint AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY bytes DESC
    `) as { name: string; bytes: string }[];
    // exact counts for our known tables
    const [{ us }] = (await sql`SELECT count(*)::int AS us FROM user_state`) as { us: number }[];
    const [{ li }] = (await sql`SELECT count(*)::int AS li FROM listings`) as { li: number }[];
    const [{ oh }] = (await sql`SELECT count(*)::int AS oh FROM open_houses`) as { oh: number }[];
    const counts: Record<string, number> = { user_state: us, listings: li, open_houses: oh };
    const [cat] = (await sql`
      SELECT
        (SELECT max(last_seen) FROM listings) AS last_ingest,
        (SELECT count(*)::int FROM open_houses WHERE start_ts > now()) AS upcoming,
        (SELECT min(start_ts) FROM open_houses) AS oh_min,
        (SELECT max(start_ts) FROM open_houses) AS oh_max
    `) as { last_ingest: string | null; upcoming: number; oh_min: string | null; oh_max: string | null }[];
    return {
      dbBytes: Number(db_bytes),
      tables: sizes.map((t) => ({ name: t.name, bytes: Number(t.bytes), rows: counts[t.name] ?? null })),
      catalog: {
        lastIngest: cat?.last_ingest ?? null,
        upcomingOpenHouses: cat?.upcoming ?? 0,
        openHouseRange: { min: cat?.oh_min ?? null, max: cat?.oh_max ?? null },
      },
    };
  });

  // --- Vercel Blob: total bytes + count (CSVs + thumbnails) ---
  const blobStats = await settle(async () => {
    let total = 0, count = 0, cursor: string | undefined, pages = 0;
    do {
      const { blobs, cursor: next } = await list({ cursor, limit: 1000 });
      for (const b of blobs) { total += b.size; count++; }
      cursor = next;
    } while (cursor && ++pages < 10);
    return { totalBytes: total, count, truncated: Boolean(cursor) };
  });

  // --- Firebase Auth: user count ---
  const firebaseStats = await settle(async () => {
    const admin = await getFirebaseAdmin();
    if (!admin) throw new Error("Firebase admin not configured");
    let count = 0, pageToken: string | undefined, pages = 0;
    do {
      const r = await admin.auth().listUsers(1000, pageToken);
      count += r.users.length;
      pageToken = r.pageToken;
    } while (pageToken && ++pages < 10);
    return { userCount: count };
  });

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    generatedAt: new Date().toISOString(),
    neon: neonStats,
    blob: blobStats,
    firebase: firebaseStats,
  }, null, 2));
}
