# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite HMR)
npm run build      # Type-check + production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build

python3 scripts/fetch-thumbnails.py  # Download listing thumbnails from Redfin
```

No test framework is configured.

## Architecture

Single-page React + TypeScript app (Vite) for planning open house visits. Reads a Redfin CSV export, filters to active listings with future open houses, displays them on a map with a sidebar, and persists user state to JSONBin.io cloud sync.

### Data pipeline

```
public/redfin-favorites_*.csv  (or localStorage "redfin-csv" if user uploaded)
  → parseCsv.ts       (PapaParse → RawListing[])
  → filterListings.ts (filter STATUS=Active + openHouseStart >= today → Listing[])
  → capRate.ts        (compute capRate + CapRateBreakdown per listing)
  → routeOptimizer.ts (group by time slot, nearest-neighbor order → TimeSlotGroup[])
  → useListings.ts    (orchestrates pipeline + all UI state)
```

**Updating for a new weekend:** upload a new Redfin CSV via the "↑ Upload CSV" button in the header (persists to `localStorage`), or drop the file in `public/` and update `CSV_PATH` in `src/utils/parseCsv.ts`. The date filter is dynamic — no code change needed for open house dates.

### Pages & routing

Hash-based routing (`window.location.hash`). `type Page = "home" | "planner" | "priority" | "data" | "finance"` in `src/App.tsx`.

- `/#home` — Browse: all non-hidden city listings, flat list + map, sort/filter controls.
- `/#planner` — Open Houses: time-slot groups, geo tracking, priority section.
- `/#priority` — same as planner but filtered to priority listings only (URL-encoded so it's bookmarkable/shareable).
- `/#data` — DataView full-screen: all listings regardless of city, multi-column sort/filter, CSV export.
- `/#finance` — FinancePage full-screen: buy-vs-rent breakdown per listing.

### State management

All user state lives in two hooks, both backed by JSONBin.io cloud sync:

- **`useHiddenIds.ts`** — `hiddenIds: Set<string>` + `priorityOrder: string[]` (ordered array; `priorityIds: Set<string>` is derived via `useMemo`). Drag-reordering in the sidebar updates `priorityOrder` and persists it.
- **`useVisits.ts`** — `visits: Record<string, VisitRecord>` keyed by listing ID. A visit record is only created explicitly via `markVisited(id)` — `setLiked`, `setRating`, `setNoteField`, `toggleWantOffer` are strict no-ops on unvisited listings.

Both hooks are composed in **`useListings.ts`**, which merges `syncStatus` values and exposes a unified API to `App.tsx`.

### Cloud sync (`src/utils/cloudSync.ts`)

Single JSONBin.io bin stores `{ hiddenIds, priorityIds, visits }`. Every write is a GET-then-PUT merge so concurrent writes don't clobber each other. A module-level `_pendingFetch` promise deduplicates React StrictMode double-invocation.

`SyncStatus`: `"loading" | "ok" | "error" | "unconfigured" | "degraded"`
- `"degraded"` — 401 from JSONBin (stale key). App loads with empty in-memory state; header shows orange badge.
- `"unconfigured"` — env vars not set; app shows a hard error screen.

**Env var injection:** `vite.config.ts` reads `.env.local` with raw Node `fs` (no dotenv-expand, avoids `$`-mangling of API keys) and injects `__JSONBIN_API_KEY__` and `__JSONBIN_BIN_ID__` via Vite `define`. `src/config.ts` re-exports these globals. Falls back to `process.env[key]` in CI.

**Required env vars** (`.env.local` for dev, GitHub Secrets for deploy):
```
VITE_JSONBIN_API_KEY=...
VITE_JSONBIN_BIN_ID=...
VITE_ANTHROPIC_API_KEY=...   # enables AI insights in SummaryModal
```

### Key types (`src/types.ts`)

```ts
Listing          // transformed CSV row: capRate, capRateBreakdown, visitOrder, timeSlot
TimeSlotGroup    // { label, startTime, endTime, listings: Listing[] }
VisitRecord      // { visitedAt, liked: boolean|null, rating: number|null (1-5), pros, cons, wantOffer }
```

### Pages / top-level components

**`App.tsx`** owns `page: Page`, `mobileTab: "map" | "list"`, sort/filter state. Derives `showOnlyPriority` from `page === "priority"` (not a separate state). `visibleGroups` applies filters + sort on top of `baseGroups` — shared between home and planner.

- **`Header`** — city selector, stats, hidden/restore button, sync badge, nav tabs (Browse / Open Houses / Data / Finance / Summary), CSV upload button.
- **`Sidebar`** → `TimeSlotGroup` → `PropertyCard` — scrollable list with sort/filter controls. `PrioritySection` shows drag-reorderable numbered list of starred properties.
- **`MapView`** — React-Leaflet map. Priority markers numbered by priority order (gold). Route fetched from OSRM public API for street-following path with directional arrow markers. Falls back to dashed straight-line if OSRM fails.
- **`DataView`** — full-screen table of all listings; multi-select filter chips, sort, CSV export.
- **`FinancePage`** — buy-vs-rent analysis. Inputs (down %, rate, term) persisted to `localStorage`. Mortgage rate auto-fetched from FRED `MORTGAGE30US` on mount. Reuses `listing.capRateBreakdown` for tax/insurance/HOA/maintenance. Color-coded rows by buy premium.
- **`SummaryModal`** — tour summary + streaming AI insights via `@anthropic-ai/sdk` (`dangerouslyAllowBrowser: true`, model `claude-opus-4-6`).

### Mobile layout

Breakpoint at `max-width: 767px`. Map/List tab bar at the bottom; active panel toggled via `show-map` / `show-list` class on `.app-body`. Uses `100dvh` and `env(safe-area-inset-*)` for notch devices.

### Thumbnails

Pre-fetched by `scripts/fetch-thumbnails.py` into `public/thumbnails/{MLS#}.jpg`. Loaded at runtime by MLS# with no fallback beyond browser default broken-image.
