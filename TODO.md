# TODO

## Rules
- Before marking a task done, have high confidence the feature works and no regressions were introduced. If that confidence cannot be reached (e.g. no way to exercise the UI, missing test data, external service unreachable), do not remove the todo — instead leave a short note under it explaining what was done and what blocks verification.
- Each task is tagged `[EASY]` / `[MEDIUM]` / `[HARD]` / `[NEEDS DISCUSSION]`. Background polling picks up `[EASY]` items first; if none remain, it breaks down a `[HARD]`/`[MEDIUM]` parent into easy subtasks before working it.

## Tasks

- *(ongoing guidance — applies to every change)* Start adding unit tests for every feature we touch going forward.

- **[EASY]** Persist the filters set on the Open Houses page as a user setting so they survive page revisits and sync across devices (via JSONBin cloud sync, not just localStorage).
  - **Work done:** Added `filters` field to `CloudState`. App.tsx hydrates from cloud on signed-in mount (only if URL hash has no filter params — shared URLs still take precedence) and debounce-writes (1s) on every filter change. Guest mode is local-only.
  - **Verification blocked by:** can't drive the UI from this session. To verify: change a few filters, refresh — they should stick; open on a second device signed into the same Google account — same filters should show; open a shared `#share?bin=…` URL — those filter params should not be overwritten.

- **[EASY]** On the Finance page, make computed numbers (Total Own Cost, and ideally any derived figure) show a hover/tooltip breakdown of the components that add up to the value.
  - **Work done:** Hover tooltips on `Total own cost`, `Effective cost`, `Net cost` with itemized breakdowns. Builders extracted to `src/utils/financeTooltips.ts` + 7 unit tests.
  - **Verification blocked by:** hover the three rows on the Finance detail panel and confirm the breakdowns read correctly.

- **[MEDIUM]** Add a light/dark mode toggle (persist as a user setting).
  - Subtasks:
    - **[EASY]** Pick a CSS-variable naming scheme (`--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--accent`, `--accent-fg`, `--good`, `--warn`, `--bad`) and add a `:root` block with current dark values + a `:root[data-theme="light"]` override block. Add nothing else — just the variable definitions.
    - **[EASY]** Add a sun/moon toggle button in `Header.tsx` that flips `document.documentElement.dataset.theme` and writes to `localStorage`. Default initial value reads `localStorage` → falls back to `prefers-color-scheme`.
    - **[EASY]** Persist `theme` field on `CloudState` (signed-in only) and rehydrate on auth-ready, with the same debounce-write pattern as the filter persistence. Guest mode stays in localStorage.
    - **[MEDIUM]** Migrate one CSS file at a time to use the variables. Start with `Header.css` and `PropertyCard.css` (highest visibility). Each migration is its own commit + visual diff.
    - **[MEDIUM]** Repeat the per-file CSS migration for the rest (`FinancePage.css`, `DataView.css`, `MapView.css`, `AuthScreen.css`, etc.).
    - **[EASY]** Unit test the toggle component (renders, click flips `data-theme`, syncs to localStorage).

- **[MEDIUM]** Rework Demo Mode: it shouldn't be a shared "plan" — it should be the same experience as Guest Mode but with pre-seeded listings/visits/priorities so users can explore the full app.
  - Subtasks:
    - **[EASY]** Commit a fixed demo CSV at `public/demo-listings.csv` (3–6 SF listings spanning weekend open houses). Include in the repo so it's loadable without auth or Blob.
    - **[EASY]** Define a `DEMO_SEED` constant (`src/utils/demoSeed.ts`) with hand-picked visits, priorities, and amenities for those listings so a demo user sees pre-populated state.
    - **[EASY]** Extend `useAuth` (or a sibling hook) with a `"demo"` AuthMode value, distinct from `"guest"`. Same in-memory behavior as guest but flagged for UI.
    - **[MEDIUM]** Update each hook (`useHiddenIds`, `useVisits`, `useFinFavorites`, `useMapZones`) to load from `DEMO_SEED` when `authMode === "demo"` (still in-memory; no cloud writes).
    - **[EASY]** Change `AuthScreen.tsx` "View Demo" button to call `enterDemo()` instead of `window.open('/#share?bin=…')`. Add a demo banner ("You're in demo mode — changes don't save") with a Sign-in button.
    - **[EASY]** Remove the `DEMO_BIN_ID` constant and the demo-bin shift-to-future logic in `App.tsx`. Update `scripts/test-share-plan.mjs` to drop the demo-bin assertions.

- **[NEEDS DISCUSSION]** Add server/client logging to help debug issues. Logs must be accessible to Claude during dev cycles (e.g. via `vercel logs` or a queryable store), but must never expose secrets to end users.
  - Open questions: do we want a third-party sink (Logtail / Axiom — both have free tiers ~1GB/mo), or a self-hosted endpoint that writes to Vercel Blob / a JSONBin bucket? What's the client-side redaction allowlist? Should every `console.error` ship, or only flagged events?

- **[NEEDS DISCUSSION]** Revisit the data model: start moving appropriate data to SQL, and separate user-specific data from user-agnostic data. Reconsider whether public listing data should live under user data at all.
  - Open questions: pick a SQL provider (Vercel Postgres / Neon / Supabase / Turso)? What's the migration path off JSONBin without a downtime window? Is the goal to make multi-user app-tenant data cleaner, or just to escape JSONBin's flat-blob constraints?
