import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { list, head } from '@vercel/blob'
import { neon } from '@neondatabase/serverless'
import { resolve } from 'path'

function readEnvLocal(): Record<string, string> {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    return Object.fromEntries(
      content.split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=');
          const raw = l.slice(i + 1).trim();
          const val = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
          return [l.slice(0, i).trim(), val];
        })
    );
  } catch (e) {
    console.error('[local-sync-api] failed to read .env.local:', e);
    return {};
  }
}

// Dev-only: derive the per-user key from a Firebase ID token WITHOUT verifying
// the signature (it's the local developer's own token). Mirrors the uid logic
// in api/sync.ts; prod verifies properly via firebase-admin.
function uidFromToken(token: string): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8'));
    return payload.user_id || payload.sub || null;
  } catch {
    return null;
  }
}

function localApis(): Plugin {
  const env = readEnvLocal();
  const DATABASE_URL = env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.warn('[local-sync-api] ⚠️  DATABASE_URL missing from .env.local — cloud sync disabled (run `vercel env pull .env.local`)');
  }
  let schemaEnsured = false;

  return {
    name: 'local-apis',
    configureServer(server) {
      // /api/sync — per-user state in Neon, keyed by the Firebase uid decoded
      // from the bearer token. Mirrors api/sync.ts (atomic JSONB merge on PUT).
      server.middlewares.use('/api/sync', async (req: IncomingMessage, res: ServerResponse) => {
        if (!DATABASE_URL) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sync not configured — set DATABASE_URL in .env.local' }));
          return;
        }
        const sql = neon(DATABASE_URL);
        if (!schemaEnsured) {
          await sql`CREATE TABLE IF NOT EXISTS user_state (uid TEXT PRIMARY KEY, state JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
          schemaEnsured = true;
        }
        const auth = (req.headers['authorization'] as string) ?? '';
        const uid = uidFromToken(auth.startsWith('Bearer ') ? auth.slice(7) : '') ?? 'local-dev';

        if (req.method === 'GET') {
          const rows = await sql`SELECT state FROM user_state WHERE uid = ${uid}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ record: rows[0]?.state ?? {} }));
          return;
        }

        if (req.method === 'PUT') {
          const rawBody = await new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            req.on('end', () => resolve(data));
            req.on('error', reject);
          });
          let patch: unknown;
          try { patch = JSON.parse(rawBody || '{}'); } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
            return;
          }
          const patchJson = JSON.stringify(patch);
          const rows = await sql`
            INSERT INTO user_state (uid, state) VALUES (${uid}, ${patchJson}::jsonb)
            ON CONFLICT (uid) DO UPDATE SET state = user_state.state || ${patchJson}::jsonb, updated_at = now()
            RETURNING state`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ record: rows[0]?.state ?? {} }));
          return;
        }

        res.writeHead(405);
        res.end('Method not allowed');
      });

      // /api/listings — serve the open-house catalog (soonest upcoming OH per address)
      server.middlewares.use('/api/listings', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
        if (!DATABASE_URL) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Catalog not configured — set DATABASE_URL in .env.local' }));
          return;
        }
        const sql = neon(DATABASE_URL);
        const rows = await sql`
          SELECT DISTINCT ON (address_key) address_key, start_raw, end_raw, mls_id
          FROM open_houses
          WHERE start_ts IS NOT NULL AND start_ts > now()
          ORDER BY address_key, start_ts ASC`;
        const openHouses: Record<string, { start: string; end: string | null; mlsId: string | null }> = {};
        for (const r of rows as { address_key: string; start_raw: string; end_raw: string | null; mls_id: string | null }[]) {
          openHouses[r.address_key] = { start: r.start_raw, end: r.end_raw, mlsId: r.mls_id };
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ openHouses, count: rows.length }));
      });

      // /api/thumbnail — proxy Vercel Blob; fall back to public/thumbnails/ locally
      server.middlewares.use('/api/thumbnail', async (req: IncomingMessage, res: ServerResponse) => {
        const mlsId = req.url?.split('/').pop()?.split('?')[0] ?? '';
        if (!mlsId) { res.writeHead(400); res.end('Missing mlsId'); return; }

        const token = env.BLOB_READ_WRITE_TOKEN;
        if (token) {
          try {
            process.env.BLOB_READ_WRITE_TOKEN = token;
            const blob = await head(`thumbnails/${mlsId}.jpg`);
            const imgRes = await fetch(blob.url, { headers: { Authorization: `Bearer ${token}` } });
            if (imgRes.ok) {
              const buf = Buffer.from(await imgRes.arrayBuffer());
              res.writeHead(200, { 'Content-Type': 'image/jpeg' });
              res.end(buf);
              return;
            }
          } catch {
            // fall through to local file
          }
        }

        const file = resolve(process.cwd(), 'public', 'thumbnails', `${mlsId}.jpg`);
        if (existsSync(file)) {
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          res.end(readFileSync(file));
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      // /api/ingest — save CSV to public/ (local dev substitute for Vercel Blob)
      server.middlewares.use('/api/ingest', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204); res.end(); return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405); res.end('Method not allowed'); return;
        }
        const csv = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `redfin-favorites_${date}.csv`;
        writeFileSync(resolve(process.cwd(), 'public', filename), csv, 'utf8');
        console.log(`[local-ingest] saved ${filename}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ csvUrl: `/public/${filename}`, thumbnails: { fetched: 0, skipped: 0, failed: 0 } }));
      });

      // /api/share — save plan JSON to public/plans/ and return a short ID
      server.middlewares.use('/api/share', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405); res.end('Method not allowed'); return;
        }
        const body = await new Promise<string>((resolve, reject) => {
          let data = '';
          req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const dir = resolve(process.cwd(), 'public', 'plans');
        mkdirSync(dir, { recursive: true });
        writeFileSync(resolve(dir, `${id}.json`), body, 'utf8');
        console.log(`[local-share] saved plans/${id}.json`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id }));
      });

      // /api/plan — serve saved plan JSON by ID
      server.middlewares.use('/api/plan', (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') {
          res.writeHead(405); res.end('Method not allowed'); return;
        }
        const qs = req.url?.split('?')[1] ?? '';
        const id = new URLSearchParams(qs).get('id') ?? '';
        const file = resolve(process.cwd(), 'public', 'plans', `${id}.json`);
        if (!id || !existsSync(file)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Plan not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(readFileSync(file, 'utf8'));
      });

      // /api/rent-estimate — proxy to RentCast AVM API
      server.middlewares.use('/api/rent-estimate', async (req: IncomingMessage, res: ServerResponse) => {
        const RENTCAST_API_KEY = env.RENTCAST_API_KEY;
        if (!RENTCAST_API_KEY) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not configured — set RENTCAST_API_KEY in .env.local' }));
          return;
        }
        const qs = (req.url ?? '').split('?')[1] ?? '';
        const r = await fetch(`https://api.rentcast.io/v1/avm/rent/long-term?${qs}`, {
          headers: { 'X-Api-Key': RENTCAST_API_KEY },
        });
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(await r.text());
      });

      // /api/csv — proxy to Vercel Blob (same as production), fall back to public/
      server.middlewares.use('/api/csv', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'GET') {
          res.writeHead(405);
          res.end('Method not allowed');
          return;
        }
        const token = env.BLOB_READ_WRITE_TOKEN;
        if (token) {
          try {
            process.env.BLOB_READ_WRITE_TOKEN = token;
            const { blobs } = await list({ prefix: 'csv/redfin-favorites_' });
            if (blobs.length > 0) {
              const latest = blobs.sort((a, b) => a.pathname.localeCompare(b.pathname)).at(-1)!;
              const csvRes = await fetch(latest.url, { headers: { Authorization: `Bearer ${token}` } });
              if (csvRes.ok) {
                console.log(`[local-csv-api] serving from Blob: ${latest.pathname}`);
                res.writeHead(200, { 'Content-Type': 'text/csv' });
                res.end(await csvRes.text());
                return;
              }
            }
          } catch (e) {
            console.warn('[local-csv-api] Blob fetch failed, falling back to public/', e);
          }
        }
        // Fallback: serve latest public/redfin-favorites_*.csv
        try {
          const files = readdirSync(resolve(process.cwd(), 'public'))
            .filter((f) => f.startsWith('redfin-favorites_') && f.endsWith('.csv'))
            .sort();
          const latest = files.at(-1);
          if (!latest) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No CSV found in Blob or public/' }));
            return;
          }
          console.log(`[local-csv-api] serving from public/${latest}`);
          res.writeHead(200, { 'Content-Type': 'text/csv' });
          res.end(readFileSync(resolve(process.cwd(), 'public', latest), 'utf8'));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

// Find the latest committed public CSV for the static fallback
const publicCsvFiles = readdirSync(resolve(process.cwd(), 'public'))
  .filter((f) => f.startsWith('redfin-favorites_') && f.endsWith('.csv'))
  .sort();
const latestPublicCsv = publicCsvFiles[publicCsvFiles.length - 1] ?? '';

export default defineConfig({
  plugins: [react(), localApis()],
  define: {
    __LATEST_CSV__: JSON.stringify(latestPublicCsv),
  },
});
