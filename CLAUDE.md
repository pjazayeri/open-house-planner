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
public/redfin-favorites_*.csv  (or localStorage "redfin-csv" if user uploaded)
  → parseCsv.ts       (PapaParse → RawListing[])
  → filterListings.ts (filter STATUS=Active + valid open house times → Listing[])
  → capRate.ts        (compute capRate + CapRateBreakdown per listing)
  → useListings.ts    (orchestrates pipeline + all UI state)
      → cityListings  (filters allListings to future open houses + selected city)
      → routeOptimizer.ts (group by time slot, nearest-neighbor → TimeSlotGroup[])
```

`allListings` contains all active listings regardless of open house date — used by Browse, Data, Finance, Analytics. `timeSlotGroups` (for the Planner) derives from `cityListings` which filters to `openHouseEnd > now`.

**Updating for a new weekend:** upload a new Redfin CSV via the "↑ Upload CSV" button (persists to `localStorage`), or drop the file in `public/` and update `CSV_PATH` in `src/utils/parseCsv.ts`.

### Pages & routing

Hash-based routing (`window.location.hash`). `type Page = "home" | "planner" | "priority" | "data" | "finance" | "analytics"` in `src/App.tsx`.

- `/#home` — Browse: all non-hidden city listings, flat list + map, sort/filter controls.
- `/#planner` — Open Houses: future time-slot groups, geo tracking, priority section.
- `/#priority` — same as planner but filtered to priority listings only.
- `/#data` — DataView full-screen: all listings, multi-column sort/filter, CSV export.
- `/#finance` — FinancePage full-screen: buy-vs-rent breakdown per listing.
- `/#analytics` — AnalyticsPage full-screen: visit stats dashboard (ratings, timeline, top-rated).

### State management

All user state lives in two hooks, both backed by JSONBin.io cloud sync:

- **`useHiddenIds.ts`** — `hiddenIds: Set<string>` + `priorityOrder: string[]` (ordered array; `priorityIds: Set<string>` derived via `useMemo`). Drag-reordering updates `priorityOrder` and persists it.
- **`useVisits.ts`** — `visits: Record<string, VisitRecord>` keyed by listing ID. Visit records only created via `markVisited(id)` — other setters are no-ops on unvisited listings.

Both hooks are composed in **`useListings.ts`**, which merges `syncStatus` values and exposes a unified API to `App.tsx`.

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
```

For local dev, `vercel env pull .env.local` pulls these down. The Vite dev server (`npm run dev`) implements `/api/sync` as a middleware in `vite.config.ts`, reading `.env.local` directly via `fs.readFileSync` — **do not use `loadEnv` or `process.env` to read these secrets** because Vite's env loader interpolates `$` characters in values, corrupting connection strings / keys. The raw parser also strips a trailing literal `\n` that `vercel env pull` can leave on values. Always read `.env.local` with the raw file parser in `vite.config.ts`.

`scripts/neon-init.mjs` creates the table; `scripts/migrate-jsonbin-to-neon.mjs` was the one-shot JSONBin→Neon migration (`--env <path>` to target a pulled prod env, `--dry` to preview).

### Key types (`src/types.ts`)

```ts
Listing       // transformed CSV row: capRate, capRateBreakdown, openHouseStart/End
TimeSlotGroup // { label, startTime, endTime, listings: Listing[] }
VisitRecord   // { visitedAt, liked: boolean|null, rating: number|null (1-5), pros, cons, wantOffer }
```

### Pages / top-level components

**`App.tsx`** owns `page: Page`, `mobileTab`, sort/filter state. Full-page components (`DataView`, `FinancePage`, `AnalyticsPage`) render instead of the main layout when active. `visibleGroups` applies filters + sort on top of `baseGroups`, shared between Browse and Planner.

- **`Header`** — city selector, stats, sync badge, nav tabs, CSV upload.
- **`Sidebar`** → `TimeSlotGroup` → `PropertyCard` — scrollable list. `PrioritySection` shows drag-reorderable starred properties.
- **`MapView`** — React-Leaflet. Priority markers numbered in gold. Route from OSRM public API with directional arrows; falls back to dashed line.
- **`DataView`** — full-screen table, filter chips, sort, CSV export.
- **`FinancePage`** — buy-vs-rent analysis. Mortgage rate auto-fetched from FRED. Inputs persisted to `localStorage`.
- **`AnalyticsPage`** — visit stats: overview cards, rating distribution bars, per-day timeline, top-rated listings, want-offer list, price/cap rate comparison table.
- **`SummaryModal`** — tour summary text + streaming AI insights via `POST /api/insights` (SSE, parsed manually — no Anthropic SDK in the browser).

### `capRate` field

`listing.capRate` is stored as a plain percentage (e.g. `2.04` = 2.04%). Do not multiply by 100 when displaying.

### Mobile layout

Breakpoint at `max-width: 767px`. Map/List tab bar at bottom; active panel toggled via `show-map` / `show-list` class on `.app-body`. Uses `100dvh` and `env(safe-area-inset-*)`.

### Thumbnails

Pre-fetched by `scripts/fetch-thumbnails.py` into `public/thumbnails/{MLS#}.jpg`.

### Deployment

Hosted on Vercel. Push to `main` triggers auto-deploy via `.github/workflows/deploy.yml` (uses `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` GitHub Secrets). `vercel --prod` deploys immediately from local.
