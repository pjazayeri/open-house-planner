import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

type RegistryEntry = { binId: string; email?: string; createdAt: string };
type Registry = Record<string, RegistryEntry>;

let adminInitialized = false;

async function getFirebaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admin = require("firebase-admin") as typeof import("firebase-admin");
  if (!adminInitialized && admin.apps.length === 0) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not configured");
    let serviceAccount: unknown;
    try {
      // Try base64-encoded first, then fall back to raw JSON
      const decoded = Buffer.from(json, "base64").toString("utf8");
      serviceAccount = JSON.parse(decoded);
      // Sanity check: a valid service account has a project_id field
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

  const REGISTRY_BIN_ID = process.env.JSONBIN_REGISTRY_BIN_ID;
  const API_KEY = process.env.JSONBIN_API_KEY;
  if (!REGISTRY_BIN_ID || !API_KEY) {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "User registry not configured" }));
    return;
  }

  const authHeader = (req.headers["authorization"] as string) ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  // Verify Firebase ID token
  let uid: string;
  let email: string | undefined;
  if (process.env.SKIP_AUTH_VERIFY === "true") {
    uid = (req.headers["x-dev-uid"] as string) ?? "dev-user";
    email = "dev@localhost";
  } else {
    try {
      const admin = await getFirebaseAdmin();
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      email = decoded.email;
    } catch (err) {
      console.error("[api/user] token verification failed:", err);
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid token", detail: String(err) }));
      return;
    }
  }

  const registryUrl = `https://api.jsonbin.io/v3/b/${REGISTRY_BIN_ID}`;
  const binHeaders = { "X-Master-Key": API_KEY };

  // Fetch the user registry
  let registry: Registry = {};
  let registryFetchOk = false;
  try {
    const registryRes = await fetch(`${registryUrl}/latest`, { headers: binHeaders });
    console.log("[api/user] registry GET status:", registryRes.status);
    if (registryRes.ok) {
      const data = (await registryRes.json()) as { record: unknown };
      if (data.record && typeof data.record === "object") {
        registry = data.record as Registry;
        registryFetchOk = true;
      }
    } else {
      const errBody = await registryRes.text().catch(() => "(unreadable)");
      console.error("[api/user] registry GET failed:", registryRes.status, errBody);
    }
  } catch (err) {
    console.error("[api/user] registry GET threw:", err);
  }

  console.log("[api/user] registry has", Object.keys(registry).length, "entries; uid lookup:", uid in registry ? "found" : "not found");

  // Return existing bin if user already registered
  if (registry[uid]) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ binId: registry[uid].binId }));
    return;
  }

  // If registry fetch failed, don't risk creating duplicate bins
  if (!registryFetchOk && Object.keys(registry).length === 0) {
    console.error("[api/user] registry fetch failed and no fallback — cannot safely assign bin");
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Registry unavailable, try again" }));
    return;
  }

  // New user — determine bin ID
  let binId: string;
  if (Object.keys(registry).length === 0 && process.env.JSONBIN_BIN_ID) {
    // Owner migration: first sign-in inherits the existing bin
    binId = process.env.JSONBIN_BIN_ID;
    console.log("[api/user] owner migration: assigning existing bin", binId);
  } else {
    // Create a new private bin for this user
    const createRes = await fetch("https://api.jsonbin.io/v3/b", {
      method: "POST",
      headers: { ...binHeaders, "Content-Type": "application/json", "X-Bin-Private": "true" },
      body: JSON.stringify({ hiddenIds: [], priorityOrder: [], visits: {} }),
    });
    if (!createRes.ok) {
      const errBody = await createRes.text().catch(() => "(unreadable)");
      console.error("[api/user] JSONBin create bin failed:", createRes.status, errBody);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create bin", detail: `${createRes.status}: ${errBody}` }));
      return;
    }
    const createData = (await createRes.json()) as { metadata: { id: string } };
    binId = createData.metadata.id;
    console.log("[api/user] created new bin", binId, "for uid", uid);
  }

  // Register user in the registry
  registry[uid] = { binId, email, createdAt: new Date().toISOString() };
  const putRes = await fetch(registryUrl, {
    method: "PUT",
    headers: { ...binHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(registry),
  });
  if (!putRes.ok) {
    const errBody = await putRes.text().catch(() => "(unreadable)");
    console.error("[api/user] registry PUT failed:", putRes.status, errBody);
    // Still return the binId — user can use it this session even if registry write failed
  } else {
    console.log("[api/user] registry PUT ok, uid", uid, "→ bin", binId);
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ binId }));
}
