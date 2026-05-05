import type { IncomingMessage, ServerResponse } from "node:http";
import { get } from "@vercel/blob";
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end("Method not allowed");
    return;
  }

  const authHeader = (req.headers["authorization"] as string) ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const uid = await getUidFromToken(token);
  if (!uid) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid token" }));
    return;
  }

  const csvPath = `csv/${uid}/redfin-favorites_latest.csv`;
  try {
    const result = await get(csvPath, { access: "private" });
    if (!result) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "No CSV uploaded yet" }));
      return;
    }
    const reader = result.stream.getReader();
    res.writeHead(200, {
      "Content-Type": "text/csv",
      "Cache-Control": "private, no-cache",
    });
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (err) {
    console.error("[api/csv] blob get failed:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Failed to fetch CSV", detail: String(err) }));
  }
}
