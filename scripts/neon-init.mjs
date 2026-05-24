// One-shot schema init for Neon (Stage 1 lift-and-shift).
// Reads DATABASE_URL from .env.local (raw parse — never via loadEnv, which
// would interpolate `$` in secrets) and creates the user_state table.
//
//   node scripts/neon-init.mjs
//
// Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS).
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

function readEnvLocal() {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const out = {};
  for (const line of content.split("\n")) {
    if (!line.includes("=") || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    const raw = line.slice(i + 1).trim();
    out[line.slice(0, i).trim()] =
      raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
  }
  return out;
}

const env = readEnvLocal();
const url = env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL missing from .env.local — run `vercel env pull .env.local`");
  process.exit(1);
}

const sql = neon(url);

await sql`
  CREATE TABLE IF NOT EXISTS user_state (
    uid        TEXT PRIMARY KEY,
    state      JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

const [{ count }] = await sql`SELECT count(*)::int AS count FROM user_state`;
console.log(`✓ user_state ready (${count} rows)`);

// Shared, user-agnostic listing catalog (keyed by normalized address). Populated
// by the cron ingester from Redfin's regional gis-csv; user state references
// listings by address_key.
await sql`
  CREATE TABLE IF NOT EXISTS listings (
    address_key    TEXT PRIMARY KEY,
    mls_id         TEXT,
    address        TEXT,
    city           TEXT,
    state          TEXT,
    zip            TEXT,
    price          NUMERIC,
    beds           NUMERIC,
    baths          NUMERIC,
    sqft           INTEGER,
    lot_size       INTEGER,
    year_built     INTEGER,
    days_on_market INTEGER,
    price_per_sqft NUMERIC,
    hoa            NUMERIC,
    property_type  TEXT,
    location       TEXT,
    status         TEXT,
    url            TEXT,
    lat            DOUBLE PRECISION,
    lng            DOUBLE PRECISION,
    raw            JSONB,
    source         TEXT,
    first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen      TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS listings_city_idx   ON listings (city)`;
await sql`CREATE INDEX IF NOT EXISTS listings_status_idx ON listings (status)`;
await sql`CREATE INDEX IF NOT EXISTS listings_mls_idx    ON listings (mls_id)`;

// Append-only open-house history. One row per (address_key, start_raw) so
// re-ingesting the same open house is a no-op, but a new weekend's slot appends.
await sql`
  CREATE TABLE IF NOT EXISTS open_houses (
    address_key TEXT NOT NULL,
    mls_id      TEXT,
    start_raw   TEXT NOT NULL,
    end_raw     TEXT,
    start_ts    TIMESTAMPTZ,
    end_ts      TIMESTAMPTZ,
    source      TEXT,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (address_key, start_raw)
  )
`;
await sql`CREATE INDEX IF NOT EXISTS open_houses_start_idx ON open_houses (start_ts)`;
await sql`CREATE INDEX IF NOT EXISTS open_houses_addr_idx  ON open_houses (address_key)`;

const [{ l }] = await sql`SELECT count(*)::int AS l FROM listings`;
const [{ oh }] = await sql`SELECT count(*)::int AS oh FROM open_houses`;
console.log(`✓ listings ready (${l} rows), open_houses ready (${oh} rows)`);
