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
    - **[EASY]** Migrate `src/components/Sidebar/PropertyCard.css` to theme tokens.
    - **[EASY]** Migrate `src/components/Sidebar/Sidebar.css` to theme tokens.
    - **[EASY]** Migrate `src/components/Finance/FinancePage.css` to theme tokens.
    - **[EASY]** Migrate `src/components/DataView/DataView.css` to theme tokens.
    - **[EASY]** Migrate `src/components/Map/MapView.css` + `src/components/Auth/AuthScreen.css` + any other remaining `*.css`.
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
