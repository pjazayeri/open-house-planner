# Open House Tour Planner

A single-page React + TypeScript app for planning weekend open house visits. Reads a Redfin CSV export, filters to active listings with open houses this weekend, displays them on a map with a sidebar, and persists user state to JSONBin.io cloud sync.

## Features

### Planner (main view)
- Interactive map (React-Leaflet) with sidebar showing listings grouped by time slot
- Nearest-neighbor visit ordering within each time slot
- Mark listings as visited, rate them 1–5 stars, thumbs up/down, leave pros/cons notes, flag for offer
- Hide listings from the tour; restore them any time
- Star priority listings to filter the map/sidebar
- GPS tracking — shows your current location and highlights the nearest listing
- City selector to filter by market
- Summary modal with AI-generated tour insights (Claude claude-opus-4-6 via streaming)

### Data page
- Full-screen table of all listings regardless of city filter
- Multi-select filter chips: visited, liked, rated, priority, hidden, want-offer, etc.
- Sort by time, price, cap rate, $/sqft, visited, rating
- Export to CSV
- Jump directly to any listing's Finance breakdown

### Finance page — Buy vs Rent
- Master-detail layout: compact property list on the left, full cost breakdown on the right
- Per-property monthly cost breakdown:
  - Principal & interest (standard amortization formula)
  - Property tax, insurance, HOA, maintenance (reused from cap rate model)
  - Opportunity cost of down payment (configurable assumed annual return)
  - Effective total cost vs estimated rent → **buy premium**
- Configurable inputs (persisted to localStorage): down payment %, mortgage rate, loan term (15/30yr), opportunity return %
- Mortgage rate auto-fills from FRED (`MORTGAGE30US`) on page load
- Rows color-coded: green (cheaper to buy or cap rate ≥ 3.5%), yellow ($0–$500/mo premium), red (>$500/mo)
- Sort by buy premium, monthly cost, price, cap rate, or $/sqft

### Cap rate model
Estimates cap rate for each listing using zip- and city-level rent $/sqft data, with expense line items for property tax (1.1%), insurance (type-adjusted), vacancy (5%), maintenance (age-adjusted), HOA, and management (multi-family only).

## Local development

### Prerequisites

- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`

### First-time setup

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server at http://localhost:5173
```

For cloud sync and AI insights to work locally, the API functions need to run too. That requires the Vercel CLI:

```bash
vercel link                  # link to the Vercel project (one-time)
vercel env pull .env.local   # pull secrets from Vercel dashboard
npm run dev:api              # start Vite + API functions via vercel dev
```

### Environment variables

Secrets live in the Vercel dashboard (not baked into the frontend bundle). After `vercel env pull`, `.env.local` will contain:

```
JSONBIN_API_KEY=...    # JSONBin master key (cloud sync)
JSONBIN_BIN_ID=...     # JSONBin bin ID
ANTHROPIC_API_KEY=...  # enables AI insights in the Summary modal
```

To run fully offline without any cloud sync, add to `.env.local`:

```
VITE_SYNC_DISABLED=true
```

### Updating for a new weekend

1. Export favorites from Redfin and drop the CSV in `public/`
2. Update `CSV_PATH` in `src/utils/parseCsv.ts`
3. Update the date check in `src/utils/filterListings.ts` → `isThisWeekend()`
4. Optionally re-run `python3 scripts/fetch-thumbnails.py` to fetch new thumbnails

## Commands

```bash
npm run dev      # Start Vite dev server (frontend only)
npm run dev:api  # Start Vite + API functions via vercel dev (requires Vercel CLI)
npm run build    # Type-check + production build
npm run lint     # ESLint
npm run preview  # Preview production build
vercel --prod    # Deploy to production manually

python3 scripts/fetch-thumbnails.py  # Download listing thumbnails from Redfin
```

## Tech stack

- React 19 + TypeScript, Vite
- React-Leaflet for the map
- PapaParse for CSV parsing
- JSONBin.io for cloud sync (GET-then-PUT merge to handle concurrent writes)
- Vercel serverless functions (`api/`) proxy to JSONBin and Anthropic — secrets never reach the browser
- No test framework
