// One-shot migration: JSONBin → Neon (Stage 1 lift-and-shift).
//
//   node scripts/migrate-jsonbin-to-neon.mjs          # migrate everything
//   node scripts/migrate-jsonbin-to-neon.mjs --dry    # report only, no writes
//
// Reads the JSONBin user registry ({ uid: { binId, email } }), fetches each
// user's bin record (their CloudState), and upserts it into Neon `user_state`
// keyed by the same Firebase uid the new /api/sync derives from the token.
//
// Idempotent: ON CONFLICT DO UPDATE refreshes from JSONBin, so it's safe to
// re-run any time BEFORE the production cutover. Do not re-run afterward (it
// would overwrite Neon-side changes with stale JSONBin data).
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const DRY = process.argv.includes("--dry");
// --env <path> reads a specific env file (e.g. a pulled prod env). Defaults to
// .env.local. The JSONBin creds differ per environment; DATABASE_URL points at
// the same Neon database either way.
const envArgIdx = process.argv.indexOf("--env");
const ENV_PATH = envArgIdx !== -1 ? process.argv[envArgIdx + 1] : null;

function readEnvLocal() {
  const content = ENV_PATH
    ? readFileSync(ENV_PATH, "utf8")
    : readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const out = {};
  for (const line of content.split("\n")) {
    if (!line.includes("=") || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    let raw = line.slice(i + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    // `vercel env pull` escapes a trailing newline in the stored value as a
    // literal `\n` inside the quotes — strip it (and any stray whitespace) so
    // bcrypt keys / bin ids aren't corrupted.
    raw = raw.replace(/\\n$/, "").trim();
    out[line.slice(0, i).trim()] = raw;
  }
  return out;
}

const env = readEnvLocal();
const { JSONBIN_REGISTRY_BIN_ID, JSONBIN_API_KEY, JSONBIN_BIN_ID, DATABASE_URL } = env;
if (!JSONBIN_REGISTRY_BIN_ID || !JSONBIN_API_KEY || !DATABASE_URL) {
  console.error("Missing JSONBIN_REGISTRY_BIN_ID / JSONBIN_API_KEY / DATABASE_URL in .env.local");
  process.exit(1);
}

const binHeaders = { "X-Master-Key": JSONBIN_API_KEY };
const sql = neon(DATABASE_URL);

async function fetchBin(binId) {
  const r = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, { headers: binHeaders });
  if (!r.ok) throw new Error(`bin ${binId} → ${r.status}`);
  const json = await r.json();
  return json.record;
}

// 1. Load registry
const registry = await fetchBin(JSONBIN_REGISTRY_BIN_ID);
const entries = Object.entries(registry ?? {});
console.log(`Registry: ${entries.length} user(s)${DRY ? " [DRY RUN]" : ""}`);

// 2. Migrate each user's bin
let migrated = 0;
const seenBins = new Set();
for (const [uid, meta] of entries) {
  const binId = meta?.binId;
  if (!binId) { console.warn(`  - ${uid}: no binId, skipped`); continue; }
  seenBins.add(binId);
  let state;
  try {
    state = await fetchBin(binId);
  } catch (e) {
    console.warn(`  - ${uid} (${meta.email ?? "?"}): fetch failed — ${e.message}`);
    continue;
  }
  const keys = state && typeof state === "object" ? Object.keys(state) : [];
  const summary = `pri:${state?.priorityIds?.length ?? 0} hid:${state?.hiddenIds?.length ?? 0} vis:${Object.keys(state?.visits ?? {}).length} snap:${Object.keys(state?.listingSnapshots ?? {}).length}`;
  console.log(`  - ${uid} (${meta.email ?? "?"}) bin=${binId}: ${keys.length} keys [${summary}]`);
  if (!DRY) {
    await sql`
      INSERT INTO user_state (uid, state) VALUES (${uid}, ${JSON.stringify(state ?? {})}::jsonb)
      ON CONFLICT (uid) DO UPDATE SET state = ${JSON.stringify(state ?? {})}::jsonb, updated_at = now()`;
  }
  migrated++;
}

// 3. Safety net: warn if the legacy owner bin isn't referenced by any registry
// entry (its data would otherwise be stranded — needs manual uid assignment).
if (JSONBIN_BIN_ID && !seenBins.has(JSONBIN_BIN_ID)) {
  console.warn(`\n⚠️  Legacy JSONBIN_BIN_ID ${JSONBIN_BIN_ID} is NOT referenced by any registry entry.`);
  console.warn(`   If it holds real data, it needs a uid to migrate. Inspect it manually:`);
  console.warn(`   curl -s -H "X-Master-Key: …" https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`);
}

const [{ n }] = await sql`SELECT count(*)::int AS n FROM user_state`;
console.log(`\n${DRY ? "Would migrate" : "Migrated"} ${migrated} user(s). user_state now has ${n} row(s).`);
