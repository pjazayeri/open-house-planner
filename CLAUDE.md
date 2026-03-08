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

Single-page React + TypeScript app (Vite) for planning open house visits. Reads a Redfin CSV export, filters to active listings with open houses this weekend, displays them on a map with a sidebar, and persists user state to JSONBin.io cloud sync.

### Data pipeline

```
public/redfin-favorites_*.csv
  → parseCsv.ts       (PapaParse → RawListing[])
  → filterListings.ts (filter by STATUS=Active + weekend dates → Listing[])
  → capRate.ts        (compute cap rate + CapRateBreakdown per listing)
  → routeOptimizer.ts (group by time slot, nearest-neighbor order → TimeSlotGroup[])
  → useListings.ts    (orchestrates pipeline + all UI state)
```

**Updating for a new weekend:** change `CSV_PATH` in `parseCsv.ts` and the `isThisWeekend()` date check in `filterListings.ts`.

### State management

All user state lives in two hooks, both backed by JSONBin.io cloud sync:

- **`useHiddenIds.ts`** — `hiddenIds: Set<string>` + `priorityIds: Set<string>`. Hidden listings are filtered from `timeSlotGroups` before display.
- **`useVisits.ts`** — `visits: Record<string, VisitRecord>` keyed by listing ID. A visit record is only created explicitly via `markVisited(id)` — other update functions (`setLiked`, `setRating`, `setNoteField`, `toggleWantOffer`) are strict no-ops on unvisited listings.

Both hooks are composed in **`useListings.ts`**, which merges their `syncStatus` values and exposes a unified API to `App.tsx`.

### Cloud sync (`src/utils/cloudSync.ts`)

Single JSONBin.io bin stores `{ hiddenIds, priorityIds, visits }`. Every write is a GET-then-PUT merge so concurrent hook writes don't clobber each other. A module-level `_pendingFetch` promise deduplicates React StrictMode's double-invocation of effects.

`SyncStatus`: `"loading" | "ok" | "error" | "unconfigured" | "degraded"`
- `"degraded"` — credentials set but 401 from JSONBin (stale key). App still loads with empty in-memory state; header shows orange badge.
- `"unconfigured"` — env vars not set; app shows a hard error screen.

**Required env vars** (`.env.local` for dev, GitHub Secrets for deploy):
```
VITE_JSONBIN_API_KEY=...
VITE_JSONBIN_BIN_ID=...
VITE_ANTHROPIC_API_KEY=...   # enables AI insights in SummaryModal
```

### Key types (`src/types.ts`)

```ts
Listing          // transformed CSV row with capRate, capRateBreakdown, visitOrder, timeSlot
TimeSlotGroup    // { label, startTime, endTime, listings: Listing[] }
VisitRecord      // { visitedAt, liked: boolean|null, rating: number|null (1-5), pros, cons, wantOffer }
```

### Pages / top-level components

**`App.tsx`** owns `page: "planner" | "data"` and `mobileTab: "map" | "list"`. The "data" page renders `DataView` full-screen as a replacement for the planner layout.

- **`Header`** — city selector, stats, hidden/restore button, sync badge, Summary and Data buttons.
- **`Sidebar`** → `TimeSlotGroup` → `PropertyCard` — scrollable visit list. PropertyCard contains the full visit panel (👍/👎, 1–5 stars, pros/cons textareas, offer toggle).
- **`MapView`** — React-Leaflet map; selection/hover synced bidirectionally with the sidebar.
- **`DataView`** (`src/components/DataView/`) — full-screen grooming page: all listings regardless of city filter, multi-select filter chips (visited, liked, rated, priority, hidden, wantOffer, etc.), sort by time/price/cap rate/$/sqft/visited/rating, CSV export.
- **`SummaryModal`** — formatted text summary of the tour + streaming AI insights via `@anthropic-ai/sdk` (`dangerouslyAllowBrowser: true`, model `claude-opus-4-6`).

### Mobile layout

Breakpoint at `max-width: 767px`. Map/List tab bar at the bottom; active panel toggled via `show-map` / `show-list` class on `.app-body`. Uses `100dvh` and `env(safe-area-inset-*)` for notch devices.

### Thumbnails

Pre-fetched by `scripts/fetch-thumbnails.py` into `public/thumbnails/{MLS#}.jpg`. Loaded at runtime by MLS# with no fallback beyond browser default broken-image.
