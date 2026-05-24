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

- ~~**[MEDIUM]** Research a free, schedulable open-house data source.~~ *(done 2026-05-24 — see `docs/research-open-house-data.md` + DONE.md. Verdict: **Redfin regional `gis-csv` via a Vercel cron** — proven to work from a Vercel datacenter IP, returns our exact CSV format. Unblocks the ingestion question below.)*

- **[HARD]** Build a DB service for listing / open-house data (user-agnostic catalog in Neon). Today listings come from a per-user Redfin CSV blob that's re-parsed on every load; there's no shared, queryable, historical store of listings or their open-house times. Move that into Neon so listing data is deduped by address, queryable, and accumulates open-house history across weekends — decoupled from any one user's CSV.
  - Decisions: **shared global catalog** (open-house data is public — one cron for everyone; favorites stay per-user in `user_state`). Ingestion = **Redfin `gis-csv` via a daily Vercel cron**.
  - **Backend DONE + verified in prod (2026-05-24):**
    - ✅ `addressKey()` extracted to `src/utils/addressKey.ts` (+ inlined copy in the cron — Vercel doesn't bundle cross-`src/` imports into functions).
    - ✅ `listings` (address-keyed) + `open_houses` (append-only, PK `(address_key, start_raw)`) tables created via `scripts/neon-init.mjs`.
    - ✅ `api/cron-listings.ts` — daily Vercel cron (13:00 UTC, `vercel.json`), gated on `CRON_SECRET`. Fetches SF gis-csv, upserts listings + appends open_houses (times → `America/Los_Angeles`). Verified: 348 listings / 200 open houses, idempotent re-run, correct tz.
  - **Remaining:**
    - Coverage: pagination via `page_number` doesn't add beyond the top ~350 ranked (got 348 unique / 200 OH). Likely covers ~all SF open houses on a given weekend, but verify; if short, find the open-house-only filter param or raise `num_homes`.
    - **[MEDIUM]** `api/listings` GET endpoint (server reads Neon).
    - **[NEEDS DISCUSSION]** Client read-path cutover: point `useListings` at `/api/listings` instead of parsing the CSV. **Product question:** the app is built around the user's *favorited* listings (CSV subset); a global catalog has all SF listings — so we need to either keep CSV as the favorites filter or add a "favorites" concept. CSV upload stays for favorites discovery regardless.
    - **[MEDIUM]** Once the client reads open-house times from the catalog: this is Stage 2 of the data-model migration — re-key user state by `address_key` and **delete `relinkIds.ts` + the snapshot bandaid**.
    - Add unit tests for the CSV parse + address-key upsert + open-house append/dedupe logic.
