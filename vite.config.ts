import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function readEnvLocal(): Record<string, string> {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    return Object.fromEntries(
      content.split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => {
          const i = l.indexOf('=');
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        })
    );
  } catch (e) {
    console.error('[local-sync-api] failed to read .env.local:', e);
    return {};
  }
}

function localSyncApi(): Plugin {
  const env = readEnvLocal();
  const BIN_ID = env.JSONBIN_BIN_ID;
  const API_KEY = env.JSONBIN_API_KEY;

  if (!BIN_ID || !API_KEY) {
    console.warn('[local-sync-api] ⚠️  JSONBIN_BIN_ID or JSONBIN_API_KEY missing from .env.local — cloud sync disabled');
  }

  return {
    name: 'local-sync-api',
    configureServer(server) {
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
    },
  };
}

export default defineConfig({
  plugins: [react(), localSyncApi()],
});
