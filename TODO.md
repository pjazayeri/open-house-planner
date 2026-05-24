# TODO

## Rules
- Each task is tagged `[EASY]` / `[MEDIUM]` / `[HARD]` / `[NEEDS DISCUSSION]`. Background polling picks up `[EASY]` items first; if none remain, it breaks down a `[HARD]`/`[MEDIUM]` parent into easy subtasks before working it.
- Before marking a task done, have high confidence the feature works and no regressions were introduced. If verification can't be reached from a Claude session (e.g. UI flows), ship the work then move the entry to `DONE.md` under the **Pending verification** section with a short note on what to check. Once you confirm it works, move it down to **Verified shipped**. If broken, move it back to `TODO.md`.
- Don't repeat work that already appears in `DONE.md` (either section).

## Tasks

- *(ongoing guidance — applies to every change)* Add unit tests for every feature we touch.

- **[MEDIUM]** Add a light/dark mode toggle (persist as a user setting).
  - Subtasks:
    - ~~Pick a CSS-variable naming scheme + add `:root` + `[data-theme="light"]` blocks.~~ *(done — see DONE.md)*
    - ~~Sun/moon toggle in Header that flips `data-theme` + writes localStorage.~~ *(done — see DONE.md)*
    - ~~Persist `theme` field on `CloudState` (signed-in only) + rehydrate.~~ *(done — see DONE.md)*
    - ~~Migrate `src/App.css` + `src/components/Header/Header.css` to theme tokens.~~ *(done — see DONE.md)*
    - **[NEEDS DISCUSSION]** Migrate the rest of the CSS to theme tokens.
      *Blocker:* PropertyCard / FinancePage / DataView / Sidebar were built as light-theme cards embedded inside the dark app (white card bg, dark text, pastel chip bgs `#fee2e2`, `#eff6ff`, `#d1fae5`). Mapping `#f1f5f9` → `var(--surface)` flips cards to dark in dark mode — that's a real design change, not a no-op. Two paths:
      (a) Keep cards always-light (introduce `--card-bg`, `--card-text` tokens that don't flip between themes — light theme has white card on light page bg, dark theme has white card on dark page bg, status quo preserved).
      (b) Truly themed cards (cards flip to dark slate in dark mode; chip background tints need dark-mode variants).
      Pick a path, then this becomes ~4 EASY per-file migrations.
    - ~~Unit test the toggle component.~~ *(done as part of subtask 2 — `useTheme.test.tsx`)*

- **[MEDIUM]** Rework Demo Mode: it shouldn't be a shared "plan" — it should be the same experience as Guest Mode but with pre-seeded listings/visits/priorities so users can explore the full app.
  - Subtasks:
    - **[EASY]** Commit a fixed demo CSV at `public/demo-listings.csv` (3–6 SF listings spanning weekend open houses). Include in the repo so it's loadable without auth or Blob.
    - **[EASY]** Define a `DEMO_SEED` constant (`src/utils/demoSeed.ts`) with hand-picked visits, priorities, and amenities for those listings so a demo user sees pre-populated state.
    - **[EASY]** Extend `useAuth` (or a sibling hook) with a `"demo"` AuthMode value, distinct from `"guest"`. Same in-memory behavior as guest but flagged for UI.
    - **[MEDIUM]** Update each hook (`useHiddenIds`, `useVisits`, `useFinFavorites`, `useMapZones`) to load from `DEMO_SEED` when `authMode === "demo"` (still in-memory; no cloud writes).
    - **[EASY]** Change `AuthScreen.tsx` "View Demo" button to call `enterDemo()` instead of `window.open('/#share?bin=…')`. Add a demo banner ("You're in demo mode — changes don't save") with a Sign-in button.
    - **[EASY]** Remove the `DEMO_BIN_ID` constant and the demo-bin shift-to-future logic in `App.tsx`. Update `scripts/test-share-plan.mjs` to drop the demo-bin assertions.

- **[NEEDS DISCUSSION]** Add server/client logging to help debug issues. Logs must be accessible to Claude during dev cycles (e.g. via `vercel logs` or a queryable store), but must never expose secrets to end users.
  - Open questions: third-party sink (Logtail / Axiom — both have free tiers ~1GB/mo), or a self-hosted endpoint that writes to Vercel Blob / a JSONBin bucket? What's the client-side redaction allowlist? Should every `console.error` ship, or only flagged events?

- **[NEEDS DISCUSSION]** Revisit the data model: start moving appropriate data to SQL, and separate user-specific data from user-agnostic data. Reconsider whether public listing data should live under user data at all.
  - Open questions: pick a SQL provider (Vercel Postgres / Neon / Supabase / Turso)? What's the migration path off JSONBin without a downtime window? Is the goal to make multi-user app-tenant data cleaner, or just to escape JSONBin's flat-blob constraints?
  - *Progress:* **Provider chosen = Neon Postgres** (Vercel Marketplace). **User-specific state migrated** (Stage 1: `user_state(uid, state jsonb)`, JSONBin retired for sync). Remaining scope = the user-agnostic listing/open-house data (see next item) + Stage 2 address-keyed remodel of user state.

- **[MEDIUM]** Research a **free, schedulable source of open-house data** so favorites uploads become rare. Today the only reason to re-export/re-upload the Redfin CSV weekly is to refresh open-house *times*; if we can pull fresh times automatically on a schedule, uploads drop to "only when my favorites change." Deliverable: a short findings note + a recommendation **grounded in a real spike result, not guesses**.
  - **Spike (the key de-risk):** hit Redfin's regional `gis-csv` open-house endpoint from a **Vercel function (datacenter IP)** — does it return data, and is it bot-blocked? Our thumbnail scraper works only because it runs from a residential IP; Vercel's IPs may be blocked. This single test decides whether free-Redfin is viable.
  - Evaluate, with the spike result in hand:
    - (a) **Redfin regional `gis-csv`** — same CSV columns we already parse (incl. `NEXT OPEN HOUSE TIME`), 1 request for all SF open houses, match to favorites by address. Most elegant if not blocked.
    - (b) **Redfin per-favorite page fetch** — we already store each listing's Redfin URL; N requests, parse page JSON.
    - (c) **Free tiers of 3rd-party APIs** (RapidAPI Realtor/Zillow, etc.) — confirm whether any *free* tier actually includes open-house times (often paywalled).
    - (d) **Official MLS/RESO** (Bridge/SimplyRETS) feasibility for a non-agent (likely needs broker sponsorship — note it, don't pursue unless we have an agent connection).
  - Capture per option: reliability/longevity, ToS/legal, rate limits, the address↔favorite matching path, and refresh cadence (Vercel cron schedule — note `crons` config in `vercel.ts`/`vercel.json`).
  - Caveat to record: refresh updates *times* for already-saved favorites; it can't auto-discover newly favorited homes without the user's Redfin login, so occasional uploads remain.
  - Output resolves the "ingestion source of truth" open question on the DB-service item below.

- **[HARD]** Build a DB service for listing / open-house data (user-agnostic catalog in Neon). Today listings come from a per-user Redfin CSV blob that's re-parsed on every load; there's no shared, queryable, historical store of listings or their open-house times. Move that into Neon so listing data is deduped by address, queryable, and accumulates open-house history across weekends — decoupled from any one user's CSV.
  - Open questions / [NEEDS DISCUSSION]:
    - Ingestion source of truth: keep the Redfin CSV upload as the feed (parse → upsert into DB), or add a scheduled fetch? Who can ingest (owner-only vs any signed-in user contributing to a shared catalog)?
    - Multi-tenant boundary: one shared global listing catalog, or per-user listing sets? (Drives whether listings are truly user-agnostic or scoped.)
    - Schema: `listings` keyed by normalized `address_key` (reuse the `addressKey()` normalizer from `src/utils/relinkIds.ts`), with current MLS#, price, beds/baths, lat/lng, capRate inputs, etc.; plus an `open_houses(address_key, start, end, source)` child table so re-lists/new weekends append rather than overwrite. This is the same `listing_cache` envisioned in Stage 2 of the migration plan — building it here structurally kills the MLS#-relink bug and lets us delete `relinkIds.ts` + the snapshot bandaid.
    - Read path: does the client query a new `/api/listings` endpoint (server reads Neon) instead of fetching+parsing the CSV? Keep CSV upload as a write path only.
  - Subtasks (once the above is decided):
    - **[MEDIUM]** Extract `addressKey()` to `src/utils/addressKey.ts` (shared server+client canonical key).
    - **[MEDIUM]** Schema + migration: `listings` + `open_houses` tables (+ indexes on `address_key`).
    - **[MEDIUM]** `api/ingest` (or CSV upload) parses → upserts listings + appends open-house rows.
    - **[MEDIUM]** `api/listings` GET endpoint; point `parseCsv`/`useListings` read path at it (CSV becomes ingest-only).
    - **[EASY]** Backfill from the current latest CSV; verify counts.
    - Add unit tests for the address-key upsert + open-house append/dedupe logic.
