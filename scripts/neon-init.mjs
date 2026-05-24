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
