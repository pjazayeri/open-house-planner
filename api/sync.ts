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
    if (!json) return null; // auth not configured (local dev without Firebase)
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

/** Decode a JWT's `uid` WITHOUT verifying the signature. Only used when
 *  SKIP_AUTH_VERIFY=true or Firebase isn't configured (local/dev paths). */
function decodeUidUnsafe(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64").toString("utf8"));
    return (payload.user_id as string) || (payload.sub as string) || null;
  } catch {
    return null;
  }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Sync not configured" }));
    return;
  }

  const authHeader = (req.headers["authorization"] as string) ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  // Resolve the per-user key (uid). In production every request must carry a
  // valid Firebase ID token; the uid comes from the verified token — never
  // from a client-supplied value — so one user can't read another's row.
  let uid: string | null = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }
    if (process.env.SKIP_AUTH_VERIFY === "true") {
      uid = decodeUidUnsafe(token);
    } else {
      try {
        const admin = await getFirebaseAdmin();
        uid = admin ? (await admin.auth().verifyIdToken(token)).uid : decodeUidUnsafe(token);
      } catch {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }
    }
  } else {
    // No Firebase configured (pure local dev) — best-effort uid from the token.
    uid = token ? decodeUidUnsafe(token) : null;
  }
  if (!uid) uid = "local-dev"; // dev-only fallback; unreachable in prod (verified above)

  const sql = neon(DATABASE_URL);

  if (req.method === "GET") {
    const rows = (await sql`SELECT state FROM user_state WHERE uid = ${uid}`) as { state: unknown }[];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ record: rows[0]?.state ?? {} }));
    return;
  }

  if (req.method === "PUT") {
    const rawBody = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    let patch: unknown;
    try {
      patch = JSON.parse(rawBody || "{}");
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }
    // Atomic JSONB shallow-merge: replaces only the top-level keys present in
    // `patch`, in a single statement. This eliminates the GET-then-PUT race
    // that JSONBin forced (two hooks writing different keys no longer clobber).
    const patchJson = JSON.stringify(patch);
    const rows = (await sql`
      INSERT INTO user_state (uid, state) VALUES (${uid}, ${patchJson}::jsonb)
      ON CONFLICT (uid) DO UPDATE
        SET state = user_state.state || ${patchJson}::jsonb,
            updated_at = now()
      RETURNING state
    `) as { state: unknown }[];
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ record: rows[0]?.state ?? {} }));
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
}
