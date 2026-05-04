import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "module";
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const API_KEY = process.env.JSONBIN_API_KEY;
  if (!API_KEY) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Sync not configured" }));
    return;
  }

  const authHeader = (req.headers["authorization"] as string) ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  // When Firebase is configured, every sync request must carry a valid ID token.
  // Without this, any client that knows a bin ID can read/write it freely.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    if (!token) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Authentication required" }));
      return;
    }
    if (process.env.SKIP_AUTH_VERIFY !== "true") {
      try {
        const admin = await getFirebaseAdmin();
        if (admin) await admin.auth().verifyIdToken(token);
      } catch {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid token" }));
        return;
      }
    }
  }

  // Authenticated requests send X-Bin-Id; fall back to env var only in local dev
  // (when FIREBASE_SERVICE_ACCOUNT_JSON is not set, any X-Bin-Id would be untrusted anyway)
  const binIdHeader = (req.headers["x-bin-id"] as string) ?? "";
  const BIN_ID = binIdHeader || process.env.JSONBIN_BIN_ID;

  if (!BIN_ID) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Sync not configured" }));
    return;
  }

  const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
  const authHeaders = { "X-Master-Key": API_KEY };

  if (req.method === "GET") {
    const r = await fetch(`${BIN_URL}/latest`, { headers: authHeaders });
    const body = await r.text();
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  if (req.method === "PUT") {
    const rawBody = await new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      req.on("end", () => resolve(data));
      req.on("error", reject);
    });
    const r = await fetch(BIN_URL, {
      method: "PUT",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: rawBody,
    });
    const body = await r.text();
    res.writeHead(r.status, { "Content-Type": "application/json" });
    res.end(body);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
}
