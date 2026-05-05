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

const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  console.error("\n[check-build-env] Missing required env vars:");
  for (const k of missing) console.error(`  - ${k}`);
  console.error(
    "\nSet these in the Vercel dashboard (Project Settings → Environment Variables)\n" +
      "as non-sensitive — VITE_-prefixed vars are public and must be readable at build time.\n"
  );
  process.exit(1);
}
