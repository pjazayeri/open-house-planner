# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server with local API proxy (reads .env.local)
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build

vercel --prod      # Deploy to production manually
npx vitest run     # Run the test suite (also runs on pre-push)
node scripts/neon-init.mjs     # Create the user_state table in Neon (reads DATABASE_URL)
python3 scripts/fetch-thumbnails.py  # Download listing thumbnails from Redfin
```

Tests run on Vitest (happy-dom). A pre-push git hook runs `vitest` before every push.

## Architecture

Single-page React + TypeScript app (Vite) hosted on Vercel for planning open house visits. Reads a Redfin CSV export, displays listings on a map with a sidebar, and persists user state to Neon Postgres via a server-side proxy (Firebase auth).

### Data pipeline

```
user's Redfin CSV  (signed-in: Vercel Blob via /api/csv · dev: bundled public/*.csv · demo: public/demo-listings.csv)
  → parseCsv.ts          (PapaParse → RawListing[])
  → overlayOpenHouses.ts (replace stale open-house times with fresh catalog times, by address)
  → filterListings.ts    (filter STATUS=Active + valid open house times → Listing[])
  → capRate.ts           (compute capRate + CapRateBreakdown per listing)
  → useListings.ts       (orchestrates pipeline + all UI state)
      → cityListings  (filters allListings to future open houses + selected city)
      → routeOptimizer.ts (group by time slot, nearest-neighbor → TimeSlotGroup[])
```

`allListings` contains all active listings regardless of open house date — used by Browse, Data, Finance, Analytics. `timeSlotGroups` (for the Planner) derives from `cityListings` which filters to `openHouseEnd > now`.

**Updating for a new weekend:** open-house *times* self-refresh from the catalog (daily cron) — re-uploading is only needed to change *which* homes are favorited. Upload a new Redfin CSV via the "↑ Upload CSV" button (stored in Vercel Blob via `/api/ingest` for signed-in users).

### Pages & routing

Hash-based routing (`window.location.hash`). `type Page` in `src/App.tsx`.

- `/#home` — Browse: all non-hidden city listings, flat list + map, sort/filter controls.
- `/#planner` — Open Houses: future time-slot groups, geo tracking, priority section.
- `/#priority` — same as planner but filtered to priority listings only.
- `/#data` — DataView full-screen: all listings, multi-column sort/filter, CSV export.
- `/#finance` — FinancePage full-screen: buy-vs-rent breakdown per listing.
- `/#analytics` — AnalyticsPage full-screen: visit stats dashboard (ratings, timeline, top-rated).
- `/#admin` — AdminPage: observability dashboard (data volume, dependency limits). Owner-only.
- `/#design` — DesignPage: architecture overview, links to `docs/DESIGN.md`. Owner-only.

**Gotcha when adding a page:** a hash is only honored if it's in the `VALID_PAGES`
allowlist in `App.tsx` (`pageFromHash()` resets anything else to `home`). Adding a
`Page` value + a route + a nav tab is *not enough* — omitting it from `VALID_PAGES`
makes the page silently bounce back to Browse on navigation.

`/#admin` and `/#design` are gated client-side by `isAdminEmail()` (`ADMIN_EMAILS`
in `App.tsx`, currently only `pauljazayeri@gmail.com`): the nav tabs are hidden and
direct navigation bounces non-admins to home. The real enforcement is server-side in
`api/admin-stats.ts` (verified-token email vs the `ADMIN_EMAILS` env, same default).

### State management

Per-user state is split across small hooks, all backed by Neon cloud sync (see below):

- **`useHiddenIds.ts`** — `hiddenIds: Set<string>` + `priorityOrder: string[]` (ordered array; `priorityIds: Set<string>` derived via `useMemo`). Drag-reordering updates `priorityOrder` and persists it.
- **`useVisits.ts`** — `visits: Record<string, VisitRecord>` keyed by listing ID. Visit records only created via `markVisited(id)` — other setters are no-ops on unvisited listings.
- **`useAmenities.ts`**, **`useMapZones.ts`**, **`useListingSnapshots.ts`** — amenities, drawn map zones, and archived-listing snapshots; same `cloudPatch` persistence pattern.

These compose in **`useListings.ts`**, which also loads the CSV, overlays fresh catalog open-house times (see *Listing catalog*), runs the pipeline, merges every hook's `syncStatus`, and exposes one unified API to `App.tsx`. Guest/demo modes run fully in-memory (no cloud).

### Cloud sync

Secrets never reach the client. The browser calls `/api/sync` (GET/PUT) and `/api/insights` (POST streaming), which are Vercel serverless functions in `api/` backed by **Neon Postgres** and Anthropic respectively.

Each user's state is a single JSONB row in the `user_state` table keyed by Firebase `uid`:
```sql
CREATE TABLE user_state (uid TEXT PRIMARY KEY, state JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
```
`api/sync.ts` verifies the Firebase ID token (via `firebase-admin`), derives the `uid` from it (never from the client), and:
- **GET** → `SELECT state FROM user_state WHERE uid=$1`, returns `{ record: state }`.
- **PUT** → `INSERT … ON CONFLICT (uid) DO UPDATE SET state = user_state.state || $patch::jsonb`. The JSONB `||` is an **atomic shallow-merge**: only the top-level keys present in the patch are replaced, in one statement. This is why `cloudPatch` no longer does a client-side GET-then-PUT — concurrent writes to different keys can't clobber each other.

`src/utils/cloudSync.ts` calls `/api/sync`, sending only the changed keys (`cloudPatch(patch)`). A module-level `_pendingFetch` deduplicates React StrictMode double-invocation. The client tracks no storage id — the server keys everything by the token's uid (so there's no `/api/user` registry; that endpoint was removed).

`SyncStatus`: `"loading" | "ok" | "error" | "unconfigured" | "degraded"`
- `"degraded"` — 401 from `/api/sync` (bad/expired token). App loads with empty in-memory state.
- Set `VITE_SYNC_DISABLED=true` in `.env.local` to run fully offline.

**Required env vars** — stored in Vercel dashboard (not baked into the bundle):
```
DATABASE_URL                  # Neon Postgres connection string (Vercel Marketplace integration)
FIREBASE_SERVICE_ACCOUNT_JSON # server-side token verification (base64 or raw JSON)
ANTHROPIC_API_KEY             # enables AI insights in SummaryModal
CRON_SECRET                   # gates /api/cron-listings; Vercel sends it as the cron's Bearer
BLOB_READ_WRITE_TOKEN         # Vercel Blob (CSV upload + thumbnails)
ADMIN_EMAILS                  # optional CSV allowlist for /api/admin-stats (defaults to the owner)
```
`VITE_FIREBASE_*` (client Firebase config) must be **non-sensitive** in Vercel so they're readable at build time; everything above is server-only.

For local dev, `vercel env pull .env.local` pulls these down. The Vite dev server (`npm run dev`) re-implements the `/api/*` routes as middleware in `vite.config.ts` (kept in parity with the `api/` functions), reading `.env.local` directly via `fs.readFileSync` — **do not use `loadEnv` or `process.env` to read these secrets** because Vite's env loader interpolates `$` characters in values, corrupting connection strings / keys. The raw parser also strips a trailing literal `\n` that `vercel env pull` can leave on values. Always read `.env.local` with the raw file parser in `vite.config.ts`.

`scripts/neon-init.mjs` creates all tables (`user_state`, `listings`, `open_houses`); `scripts/migrate-jsonbin-to-neon.mjs` was the one-shot JSONBin→Neon migration (`--env <path>` to target a pulled prod env, `--dry` to preview).

### Listing catalog (shared, address-keyed)

Open-house data is **user-agnostic public data**, so it lives in a shared catalog
separate from per-user state — two Neon tables created by `neon-init.mjs`:
- **`listings`** — keyed by `address_key` (normalized address), one row per home.
- **`open_houses`** — append-only history, PK `(address_key, start_raw)`, so re-ingest
  is idempotent but each new weekend's slot accumulates. Times are stored as the raw
  Redfin string plus a `timestamptz` (parsed `AT TIME ZONE 'America/Los_Angeles'`).

`addressKey()` (`src/utils/addressKey.ts`) is the canonical normalizer — it makes a
user's stars/hides survive an MLS# change (Redfin re-lists under new MLS numbers), the
original reason state isn't keyed by MLS#. **It's inlined (copied) into `api/`
functions** because Vercel transpiles each `api/` file and resolves imports at
runtime — it does *not* bundle cross-`src/` imports into the lambda (importing
`../src/...` throws `ERR_MODULE_NOT_FOUND`). For the same reason, **don't use
PapaParse server-side** (it references browser globals at load and crashes the
function — parse CSV inline; see `api/cron-listings.ts`).

Flow:
- **`api/cron-listings.ts`** — daily Vercel cron (`vercel.json` `crons`, gated on
  `CRON_SECRET`). Fetches SF listings from Redfin's regional `gis-csv` endpoint (the
  same CSV format as the favorites export — no HTML scraping), upserts `listings`,
  appends `open_houses`. Coverage caps at ~350 rows; `page_number` pagination doesn't
  extend it. See `docs/research-open-house-data.md`.
- **`api/listings.ts`** (GET, auth-gated) — returns the soonest upcoming open house
  per `address_key`.
- **`useListings.ts`** calls it on load and `overlayOpenHouses()` (`src/utils/`)
  replaces stale CSV open-house times with the catalog's fresh ones, matched by
  `addressKey`, **before** the transform pipeline. So the uploaded CSV defines *which*
  homes are favorites; the catalog keeps their *times* current — re-uploading weekly
  is no longer required.

### Admin / observability

**`api/admin-stats.ts`** (admin-gated, see *Pages & routing*) reports live data volume
across every storage dependency — Neon (db + per-table sizes vs the 0.5 GB free cap,
row counts, catalog health), Vercel Blob (bytes + object count), Firebase Auth (user
count) — each guarded so one failing service degrades gracefully. Metered services with
no clean usage API (Vercel bandwidth/functions, Neon compute, Anthropic, RentCast) are
shown as reference + console links in the `AdminPage`, not measured.

### Key types (`src/types.ts`)

```ts
Listing       // transformed CSV row: capRate, capRateBreakdown, openHouseStart/End
TimeSlotGroup // { label, startTime, endTime, listings: Listing[] }
VisitRecord   // { visitedAt, liked: boolean|null, rating: number|null (1-5), pros, cons, wantOffer }
```

### Pages / top-level components

**`App.tsx`** owns `page: Page`, `mobileTab`, sort/filter state. Full-page components (`DataView`, `FinancePage`, `AnalyticsPage`, `AdminPage`, `DesignPage`) render instead of the main layout when active. `visibleGroups` applies filters + sort on top of `baseGroups`, shared between Browse and Planner.

- **`Header`** — city selector, stats, sync badge, nav tabs, CSV upload.
- **`Sidebar`** → `TimeSlotGroup` → `PropertyCard` — scrollable list. `PrioritySection` shows drag-reorderable starred properties.
- **`MapView`** — React-Leaflet. Priority markers numbered in gold. Route from OSRM public API with directional arrows; falls back to dashed line.
- **`DataView`** — full-screen table, filter chips, sort, CSV export.
- **`FinancePage`** — buy-vs-rent analysis. Mortgage rate auto-fetched from FRED. Inputs persisted to `localStorage`.
- **`AnalyticsPage`** — visit stats: overview cards, rating distribution bars, per-day timeline, top-rated listings, want-offer list, price/cap rate comparison table.
- **`SummaryModal`** — tour summary text + streaming AI insights via `POST /api/insights` (SSE, parsed manually — no Anthropic SDK in the browser).
- **`AdminPage`** / **`DesignPage`** — owner-only observability dashboard and architecture overview (see *Pages & routing*, *Admin / observability*).

### `capRate` field

`listing.capRate` is stored as a plain percentage (e.g. `2.04` = 2.04%). Do not multiply by 100 when displaying.

### Mobile layout

Breakpoint at `max-width: 767px`. Map/List tab bar at bottom; active panel toggled via `show-map` / `show-list` class on `.app-body`. Uses `100dvh` and `env(safe-area-inset-*)`.

### Thumbnails

Pre-fetched by `scripts/fetch-thumbnails.py` into `public/thumbnails/{MLS#}.jpg`.

### Deployment

Hosted on Vercel. Push to `main` triggers auto-deploy via `.github/workflows/deploy.yml` (uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` GitHub Secrets). `vercel --prod` deploys immediately from local.
