# Design & Architecture

> High-level design of the Open House Planner. Start here, then dive into
> `CLAUDE.md` for build/ops detail and the source for specifics.

## 1. What it is

A single-page web app for planning a weekend of open-house visits in San
Francisco. You bring a Redfin "favorites" CSV (or favorite homes in-app); the
app plots them on a map, groups them into time-slot routes, computes a rough
cap rate, and tracks your visit notes/ratings — all synced across devices.

The hard parts aren't the UI; they're **keeping listing data fresh without
manual re-uploads** and **never silently losing the user's hand-curated state**.

## 2. Architecture at a glance

```
┌──────────────────────────── Client (browser) ────────────────────────────┐
│  React + TypeScript + Vite SPA, hash-routed                               │
│  Pages: Browse · Planner · Priority · Data · Finance · Analytics · Admin  │
│  State hooks: useListings ─ useHiddenIds ─ useVisits ─ useAmenities …      │
│  Map: React-Leaflet + OSRM routes                                         │
└───────────────┬───────────────────────────────────────────────────────────┘
                │  fetch  (Firebase ID token as Bearer)
┌───────────────▼──────────────── Serverless API (Vercel Functions) ─────────┐
│  /api/sync          per-user state  (GET / PUT, atomic JSONB merge)         │
│  /api/listings      shared catalog open-house times (GET)                   │
│  /api/cron-listings daily Redfin gis-csv → catalog (cron, CRON_SECRET)      │
│  /api/admin-stats   observability (admin-gated)                             │
│  /api/csv /api/ingest  CSV in Vercel Blob   /api/insights  AI (SSE)         │
│  /api/share /api/plan  public share links                                   │
└───────┬───────────────────────────┬───────────────────────────┬────────────┘
        │                           │                           │
 ┌──────▼──────┐            ┌───────▼────────┐          ┌────────▼─────────┐
 │   Neon       │            │  Vercel Blob   │          │  External APIs    │
 │  Postgres    │            │  CSVs +        │          │  Redfin gis-csv   │
 │  user_state  │            │  thumbnails    │          │  Anthropic (AI)   │
 │  listings    │            └────────────────┘          │  RentCast (rent)  │
 │  open_houses │                                        │  FRED (mortgage)  │
 └──────────────┘     Auth: Firebase (Google / guest)    │  OSRM (routing)   │
                                                         └───────────────────┘
```

Three layers, one rule: **secrets never reach the client.** The browser only
ever talks to our own `/api/*` functions, which hold the keys and proxy out.

## 3. Data model — the central design choice

State is split by *who owns it*:

- **Per-user state** → `user_state(uid, state JSONB, updated_at)` in Neon, keyed
  by Firebase uid. Holds priorities, hidden listings, visits, map zones,
  amenities, theme, filters — one JSONB document per user. Writes are an
  **atomic JSONB shallow-merge** (`state || $patch`) so two hooks updating
  different keys can't clobber each other.

- **Shared, user-agnostic catalog** → `listings` (keyed by a normalized
  `address_key`) + `open_houses` (append-only history, PK `(address_key,
  start_raw)`). This is *public* data — the same SF listings and open-house
  times for everyone — so one daily cron populates it for all users.

- **Bulk blobs** → the uploaded Redfin CSV and listing thumbnails live in
  **Vercel Blob**, not the database.

Why `address_key` and not MLS#: Redfin re-lists properties under new MLS numbers,
which used to silently orphan a user's stars/hides. Keying shared data by a
normalized address makes the link survive an MLS# change by construction.

## 4. Data flow

```
Redfin gis-csv ──(daily cron)──▶ listings + open_houses (Neon catalog)
                                          │
Redfin favorites CSV ──upload──▶ Vercel Blob ──load──▶ RawListing[]
                                          │                 │
                       /api/listings ◀────┘   overlay fresh open-house
                       (by address)            times onto favorites
                                                  │
                          parseCsv → filterListings → capRate
                                                  │
                                            useListings  ◀── cloud user-state
                                                  │
                                  routeOptimizer (time-slot groups)
                                                  │
                                       Map + Sidebar + Finance + Analytics
```

The upload defines *which* homes are yours; the catalog keeps their open-house
*times* current — so re-uploading the CSV every weekend is no longer required.

## 5. Key design decisions & trade-offs

- **JSONBin → Neon Postgres.** The original per-user JSON blob store required a
  client-side GET-then-PUT for every write — racy, and the source of repeated
  "my changes got clobbered" bugs. Neon's JSONB `||` merge makes each write a
  single atomic statement. Trade-off: a real DB + connection management, paid
  for by correctness and room to grow into relational tables.

- **Shared catalog vs. per-user listings.** Open-house data is public, so it's
  stored once and refreshed by one cron — not duplicated per user. User-specific
  intent (favorites/priorities) stays separate in `user_state`.

- **Redfin `gis-csv` via cron, not screen-scraping.** The cron calls Redfin's
  own CSV-export endpoint (same one behind "Download All") — structured data, no
  HTML parsing. Trade-off: unofficial endpoint; if it breaks, fall back to
  per-listing fetch or a paid API. (See `docs/research-open-house-data.md`.)

- **Serverless functions are self-contained.** Vercel transpiles each `api/`
  file and resolves imports at runtime — it does *not* bundle cross-`src/`
  imports — so shared helpers (e.g. `addressKey`) are inlined in functions, and
  browser-only libs (PapaParse) are avoided server-side.

- **Auth gates everything server-side.** Every `/api/*` write verifies a
  Firebase ID token and derives the uid from it — never from a client value —
  so one user can't read or write another's row.

## 6. Tech stack & dependencies

| Concern | Choice | Notes |
|---|---|---|
| UI | React 19 + TypeScript + Vite | hash-routed SPA |
| Hosting | Vercel | functions + static, GitHub auto-deploy |
| Auth | Firebase Auth | Google sign-in; guest/demo modes |
| Database | Neon Postgres | `@neondatabase/serverless` HTTP driver |
| Blob storage | Vercel Blob | CSVs + thumbnails |
| Map | React-Leaflet + OSRM | routed, numbered priority markers |
| AI insights | Anthropic API | streamed via `/api/insights` (SSE) |
| Rent / rates | RentCast, FRED | finance estimates |
| Listing source | Redfin `gis-csv` | daily cron ingest |
| Tests | Vitest + Testing Library | pre-push hook runs them |

## 7. Local dev & deploy

- `npm run dev` — Vite dev server; `vite.config.ts` reimplements the `/api/*`
  routes as middleware against the same Neon DB (reads `.env.local` raw to avoid
  `$`-interpolation of secrets).
- `npm run build` — `tsc -b && vite build`.
- Push to `main` → GitHub Actions deploys to Vercel. Crons run in production.

See `CLAUDE.md` for the full ops detail and gotchas.
