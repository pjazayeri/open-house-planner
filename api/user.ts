import type { IncomingMessage, ServerResponse } from "node:http";

type RegistryEntry = { binId: string; email?: string; createdAt: string };
type Registry = Record<string, RegistryEntry>;

let adminInitialized = false;

async function getFirebaseAdmin() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admin = require("firebase-admin") as typeof import("firebase-admin");
  if (!adminInitialized && admin.apps.length === 0) {
    const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!json) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not configured");
    const serviceAccount = JSON.parse(Buffer.from(json, "base64").toString("utf8"));
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
    } catch {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid token" }));
      return;
    }
  }

  const registryUrl = `https://api.jsonbin.io/v3/b/${REGISTRY_BIN_ID}`;
  const binHeaders = { "X-Master-Key": API_KEY };

  // Fetch the user registry
  let registry: Registry = {};
  try {
    const registryRes = await fetch(`${registryUrl}/latest`, { headers: binHeaders });
    if (registryRes.ok) {
      const data = (await registryRes.json()) as { record: unknown };
      if (data.record && typeof data.record === "object") {
        registry = data.record as Registry;
      }
    }
  } catch {
    // Registry fetch failed — treat as empty
  }

  // Return existing bin if user already registered
  if (registry[uid]) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ binId: registry[uid].binId }));
    return;
  }

  // New user — determine bin ID
  let binId: string;
  if (Object.keys(registry).length === 0 && process.env.JSONBIN_BIN_ID) {
    // Owner migration: first sign-in inherits the existing bin
    binId = process.env.JSONBIN_BIN_ID;
  } else {
    // Create a new private bin for this user
    const createRes = await fetch("https://api.jsonbin.io/v3/b", {
      method: "POST",
      headers: { ...binHeaders, "Content-Type": "application/json", "X-Bin-Private": "true" },
      body: JSON.stringify({}),
    });
    if (!createRes.ok) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Failed to create bin" }));
      return;
    }
    const createData = (await createRes.json()) as { metadata: { id: string } };
    binId = createData.metadata.id;
  }

  // Register user in the registry
  registry[uid] = { binId, email, createdAt: new Date().toISOString() };
  await fetch(registryUrl, {
    method: "PUT",
    headers: { ...binHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(registry),
  });

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ binId }));
}
