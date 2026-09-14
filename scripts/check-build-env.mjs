// Fails the build if any required client-side env var is missing.
// VITE_-prefixed vars are baked into the bundle at build time, so an empty
// value silently breaks production. This guard surfaces the failure before
// `vite build` runs.

const REQUIRED = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
];

// Local builds (e.g. the iOS shell via scripts/ios-testflight.sh) keep these in
// .env.local (pulled with `vercel env pull`). Vite reads that file itself; this
// guard just needs to see the same values. Raw parse — no `$` interpolation.
import { readFileSync } from "node:fs";
let local = {};
try {
  local = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        const raw = l.slice(i + 1).trim();
        return [l.slice(0, i).trim(), raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw];
      })
  );
} catch {
  /* no .env.local — fine on Vercel */
}

const missing = REQUIRED.filter((k) => !process.env[k] && !local[k]);

if (missing.length > 0) {
  console.error("\n[check-build-env] Missing required env vars:");
  for (const k of missing) console.error(`  - ${k}`);
  console.error(
    "\nSet these in the Vercel dashboard (Project Settings → Environment Variables)\n" +
      "as non-sensitive — VITE_-prefixed vars are public and must be readable at build time.\n"
  );
  process.exit(1);
}
