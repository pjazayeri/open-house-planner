import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { list } from '@vercel/blob'
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

function localApis(): Plugin {
  const env = readEnvLocal();
  const BIN_ID = env.JSONBIN_BIN_ID;
  const API_KEY = env.JSONBIN_API_KEY;

  if (!BIN_ID || !API_KEY) {
    console.warn('[local-sync-api] ⚠️  JSONBIN_BIN_ID or JSONBIN_API_KEY missing from .env.local — cloud sync disabled');
  }

  return {
    name: 'local-apis',
    configureServer(server) {
      // /api/sync — proxy to JSONBin
      server.middlewares.use('/api/sync', async (req: IncomingMessage, res: ServerResponse) => {
        if (!BIN_ID || !API_KEY) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Sync not configured — set JSONBIN_BIN_ID and JSONBIN_API_KEY in .env.local' }));
          return;
        }

        const BIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
        const authHeaders = { 'X-Master-Key': API_KEY };

        if (req.method === 'GET') {
          const r = await fetch(`${BIN_URL}/latest`, { headers: authHeaders });
          const body = await r.text();
          res.writeHead(r.status, { 'Content-Type': 'application/json' });
          res.end(body);
          return;
        }

        if (req.method === 'PUT') {
          const rawBody = await new Promise<string>((resolve, reject) => {
            let data = '';
            req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            req.on('end', () => resolve(data));
            req.on('error', reject);
          });
          const r = await fetch(BIN_URL, {
            method: 'PUT',
            headers: { ...authHeaders, 'Content-Type': 'application/json' },
            body: rawBody,
          });
          const body = await r.text();
          res.writeHead(r.status, { 'Content-Type': 'application/json' });
          res.end(body);
          return;
        }

        res.writeHead(405);
        res.end('Method not allowed');
      });

      // /api/thumbnail — serve from public/thumbnails/ locally
      server.middlewares.use('/api/thumbnail', (req: IncomingMessage, res: ServerResponse) => {
        const mlsId = req.url?.split('/').pop()?.split('?')[0] ?? '';
        const file = resolve(process.cwd(), 'public', 'thumbnails', `${mlsId}.jpg`);
        if (mlsId && existsSync(file)) {
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
