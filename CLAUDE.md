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

This is a single-page React + TypeScript app for planning open house visits. It reads a Redfin CSV export, filters to active listings with open houses this weekend, and displays them on an interactive map with a sidebar.

### Data flow

1. **`public/redfin-favorites_*.csv`** — Redfin favorites export, served as a static file. The filename is hardcoded in `src/utils/parseCsv.ts`.
2. **`src/utils/parseCsv.ts`** — Fetches and parses the CSV using PapaParse into `RawListing[]`.
3. **`src/utils/filterListings.ts`** — Filters to `STATUS === "Active"` + open house dates matching a hardcoded weekend (currently Feb 28 / Mar 1, 2026). Transforms `RawListing` → `Listing`, computing cap rates.
4. **`src/utils/capRate.ts`** — Estimates cap rate from listing data using hardcoded zip/city rent-per-sqft tables, property type multipliers, and expense models. All assumptions are exposed in `CapRateBreakdown`.
5. **`src/utils/routeOptimizer.ts`** — Groups listings by open house time slot, then applies nearest-neighbor (haversine) ordering across slots to produce a `TimeSlotGroup[]` with visit numbers.
6. **`src/hooks/useListings.ts`** — Orchestrates the pipeline; owns all state (loading, city filter, selection, hover). Exposes `timeSlotGroups` as the primary derived value consumed by UI.
7. **`App.tsx`** — Composes `Header`, `Sidebar`, and `MapView`, passing `timeSlotGroups`, `selectedId`, and `hoveredId` down.

### Key types (`src/types.ts`)

- `RawListing` — direct CSV column mapping (all strings)
- `Listing` — transformed, typed listing with computed `capRate` and `capRateBreakdown`
- `TimeSlotGroup` — a labeled group of `Listing[]` ordered for visiting

### UI components

- **`Header`** — city selector dropdown + summary stats
- **`Sidebar`** — scrollable list of `TimeSlotGroup` sections, each containing `PropertyCard` components
- **`MapView`** — React-Leaflet map with markers; selection/hover synced bidirectionally with the sidebar

### Thumbnails

Property thumbnails are pre-fetched by `scripts/fetch-thumbnails.py` into `public/thumbnails/{MLS#}.jpg`. The script scrapes Redfin `og:image` tags. The UI loads thumbnails by MLS# at runtime with no fallback handling beyond the browser's default broken-image state.

### Updating for a new weekend

Two places need updating when refreshing for a new open house weekend:
1. `src/utils/parseCsv.ts` — `CSV_PATH` constant with the new filename
2. `src/utils/filterListings.ts` — `isThisWeekend()` date check
