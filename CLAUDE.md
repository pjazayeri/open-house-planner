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
6. **`src/hooks/useListings.ts`** — Orchestrates the pipeline; owns all state (loading, city filter, selection, hover, hidden). Exposes `timeSlotGroups` as the primary derived value consumed by UI. Also exposes `hiddenCount`, `hideListing(id)`, and `clearHidden()`.
7. **`src/hooks/useHiddenIds.ts`** — Manages the `Set<string>` of hidden listing IDs with dual persistence: localStorage (`"open-house-hidden-ids"`) and optional JSONBin.io cloud sync for cross-device state. Credentials via `VITE_JSONBIN_API_KEY` / `VITE_JSONBIN_BIN_ID` env vars.
8. **`App.tsx`** — Composes `Header`, `Sidebar`, and `MapView`. Owns `mobileTab` state (`"map" | "list"`) for the mobile tab bar; auto-switches to `"list"` when a map marker is clicked.

### Key types (`src/types.ts`)

- `RawListing` — direct CSV column mapping (all strings)
- `Listing` — transformed, typed listing with computed `capRate` and `capRateBreakdown`
- `TimeSlotGroup` — a labeled group of `Listing[]` ordered for visiting

### UI components

- **`Header`** — city selector dropdown + summary stats. Shows a "N hidden · Restore" button (red) when any listings are hidden.
- **`Sidebar`** — scrollable list of `TimeSlotGroup` sections, each containing `PropertyCard` components.
- **`PropertyCard`** — displays listing details with a hide button ("✕") in the card header that calls `onHide(id)`. On mobile the hide button is enlarged (32×32px). The rent tooltip renders inline (static position, full width) on mobile instead of as a floating overlay.
- **`MapView`** — React-Leaflet map with markers; selection/hover synced bidirectionally with the sidebar. Marker click auto-switches the mobile tab to `"list"`.

### Mobile layout

The app is fully responsive with a breakpoint at `max-width: 767px`:

- **Tab bar** — a bottom `Map` / `List` tab bar (`.mobile-tab-bar`) replaces the side-by-side desktop layout. The active panel is toggled via a `show-map` / `show-list` CSS class on `.app-body`.
- **Viewport** — uses `100dvh` (dynamic viewport height) so browser chrome doesn't clip content.
- **Safe areas** — `env(safe-area-inset-top/bottom)` applied to the header and tab bar for notch/home-bar devices.
- **Touch UX** — `-webkit-tap-highlight-color: transparent` on interactive elements; `-webkit-overflow-scrolling: touch` on the sidebar for momentum scrolling.

### Hidden units

Users can hide individual listings with the "✕" button on each `PropertyCard`. Hidden listings are:

- Filtered out of `timeSlotGroups` in `useListings.ts`.
- Persisted to **localStorage** immediately.
- Optionally synced to **JSONBin.io** (cloud) so hidden state roams across devices. Set `VITE_JSONBIN_API_KEY` and `VITE_JSONBIN_BIN_ID` env vars to enable.
- Restored all at once via the "Restore" button in `Header` (calls `clearHidden()`).

### Thumbnails

Property thumbnails are pre-fetched by `scripts/fetch-thumbnails.py` into `public/thumbnails/{MLS#}.jpg`. The script scrapes Redfin `og:image` tags. The UI loads thumbnails by MLS# at runtime with no fallback handling beyond the browser's default broken-image state.

### Updating for a new weekend

Two places need updating when refreshing for a new open house weekend:
1. `src/utils/parseCsv.ts` — `CSV_PATH` constant with the new filename
2. `src/utils/filterListings.ts` — `isThisWeekend()` date check
