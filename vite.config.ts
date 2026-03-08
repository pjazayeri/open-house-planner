import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, existsSync } from 'node:fs'

/**
 * Read .env files with plain Node fs — no dotenv-expand — so values
 * containing $ are never misinterpreted as variable references.
 * Falls back to process.env for CI where secrets are real env vars.
 */
function rawEnv(key: string): string {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_]\w*)\s*=\s*(.*)$/)
      if (m?.[1] === key) {
        // Strip optional surrounding quotes (single or double)
        return m[2].replace(/^(['"])(.*)\1$/, '$2')
      }
    }
  }
  return process.env[key] ?? ''
}

export default defineConfig({
  plugins: [react()],
  base: '/open-house-planner/',
  define: {
    __JSONBIN_API_KEY__: JSON.stringify(rawEnv('VITE_JSONBIN_API_KEY')),
    __JSONBIN_BIN_ID__:  JSON.stringify(rawEnv('VITE_JSONBIN_BIN_ID')),
  },
})
