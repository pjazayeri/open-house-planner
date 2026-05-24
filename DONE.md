# DONE

History of shipped work. New entries go on top. When a `[PENDING VERIFICATION]` item is confirmed working, move it to `Verified shipped`. If it turns out to be broken, move it back to `TODO.md` with notes.

## Pending verification

- **Persist Open Houses filters via cloud sync** *(shipped 2026-05-11, commit a224674)*
  Added `filters` field to `CloudState`. App.tsx hydrates from cloud on signed-in mount (only if URL hash has no filter params — shared URLs still take precedence) and debounce-writes (1s) on every filter change. Guest mode is local-only.
  *Verify:* change filters → refresh → they stick; second device signed into the same account → same filters appear; shared `#share?bin=…` URL → its filter params not overwritten.

- **Finance: hover tooltips on Total/Effective/Net cost** *(shipped 2026-05-12, commit ca1249a)*
  Hover the three bold totals on the Finance detail panel — each itemizes the components that sum to it. Builders in `src/utils/financeTooltips.ts` + 7 unit tests covering the principal-toggle / HOA-zero / zero-deduction branches.
  *Verify:* hover the three rows on the Finance detail panel, breakdowns read correctly.

- **CSS migration: App.css + Header.css → theme tokens (light/dark subtask)** *(shipped 2026-05-12)*
  Replaced chrome colors (backgrounds, text scale, borders, accents) in `src/App.css` and `src/components/Header/Header.css` with `var(--bg)`, `var(--surface)`, `var(--text)`, `var(--text-muted/dim/faint)`, `var(--border)`, `var(--border-strong)`, `var(--border-faint)`, `var(--accent)`, `var(--good/warn/bad)`, `var(--shadow)`. Brand colors (Redfin orange, Share purple, Upload green, Restore red, theme-toggle yellow) and semantic toast bg/borders left hardcoded.
  *Verify:* Header + CSV-upload screen + mobile tab bar + loading screens + drop overlay now respect the theme toggle. Dark looks unchanged; flip the sun/moon to confirm light. Share-plan dropdown was deliberately not migrated yet (intentional white-card-in-dark styling).

- **Theme persistence on CloudState (subtask 3/6 of light/dark mode toggle)** *(shipped 2026-05-12)*
  `theme?: "dark" | "light"` field added to `CloudState`. App.tsx now owns the `useTheme()` state (lifted from Header) and passes `theme` + `onToggleTheme` down. Two effects mirror the filter-persistence pattern: hydrate-once on `authMode === "signed-in"` calls `setTheme(state.theme)` if present, and a debounce-write (1s) ships the current theme on change. Guest/loading/signed-out modes stay localStorage-only. Header.test.tsx baseProps updated; all 121 tests still green.
  *Verify:* sign in, toggle theme, refresh — sticks. Open on a second device signed into the same Google account — same theme. Sign out and back in as guest — theme persists via localStorage only.

- **Sun/moon toggle in Header (subtask 2/6 of light/dark mode toggle)** *(shipped 2026-05-12)*
  Added `useTheme()` hook (`src/hooks/useTheme.ts`) that owns `Theme = "dark" | "light"`, writes `data-theme` on `<html>`, mirrors to `localStorage`, defaults from `prefers-color-scheme` when no stored value. Header.tsx renders a small ☀ / ☾ button right after the Summary tab. 5 unit tests in `useTheme.test.tsx` cover default-from-OS, default-from-storage, toggle round-trip, direct setTheme, and data-theme attribute updates.
  *Verify:* tap the sun/moon icon — it should change, persist across refresh, and `<html data-theme="…">` should flip in dev tools. No visible color change yet because component CSS hasn't been migrated to the variables (next subtask).

- **Light/dark theme tokens defined** *(shipped 2026-05-12, subtask 1/6 of light/dark mode toggle)*
  Added a `:root` block in `src/index.css` with the 17 theme variables the app uses (surfaces, text, borders, accents, shadow) plus a `:root[data-theme="light"]` override block. Default values match the existing dark palette so this is a visual no-op until subsequent commits migrate component CSS to consume the variables.
  *Verify:* site still renders identical to before — `vercel --prod` deploy. No theme switch is wired up yet (next subtask).

## Verified shipped

- **Research: free, schedulable open-house data source** *(2026-05-24)* — Verdict: **Redfin regional `gis-csv` via a Vercel cron**. Spike-tested from a Vercel datacenter IP (temp `api/spike-redfin.ts`, since removed): `WORKS_FROM_VERCEL` — HTTP 200, our exact CSV format, 351 rows / 201 open houses, not bot-blocked. Returns the same columns as the favorites export (reuse `parseCsv.ts`). Full findings + recommendation in `docs/research-open-house-data.md`. Unblocks the ingestion-source question on the "DB service for listing/open-house data" TODO.
- **Apple Maps URL fix** *(2026-05-11)* — address links use `daddr=<lat>,<lng>&q=<label>` instead of the broken `daddr=<address>&ll=<lat>,<lng>` combo (Apple Maps was ignoring `daddr` when `ll` was present and opening with an empty destination). Confirmed by user.
- **Share Plan dropdown z-index / mobile-modal fix** *(2026-05-11)* — portal-rendered dropdown was painted under the header (z:200 vs header z:1000); bumped to z:3000 and switched mobile under-767px to a centered modal with backdrop. Confirmed by user ("it looks like its working now").
- **Favorites unification** *(2026-05-11)* — dropped `finFavoriteIds`; one star (priorityIds) tracks across Planner + Finance. One-shot migration in `useHiddenIds` unions legacy favs in.
- **Demo bin → weekend-only data** *(2026-05-10)* — replaced demo bin (`6a00dfd7c0954111d804071d`) with Sat/Sun-only listings; `shiftPlanToFuture` no longer surfaces a weekday open house. `scripts/test-share-plan.mjs` enforces weekend-only as a regression test.
- **Tap address → Apple Maps / Google Maps** *(2026-05-10)* — wired `navigationUrl()` into PropertyCard, FinancePage detail, MapPlanView popup, and the share-plan iframe HTML.
- **Map zones in Finance filter** *(2026-05-10)* — Finance's "Hood:" dropdown replaced with "Zone:" populated from the user's drawn polygons; filter uses `pointInPolygon`.
- **Cap rate updates with rent override** *(2026-05-10)* — Finance badge + sort comparator now use `effectiveCapRate` recomputed via `recalcCapRateWithRent` (vacancy/maintenance/management scale by rent ratio; fixed costs unchanged). Tests in capRate.test.ts.
- **2615 Octavia + other no-open-house listings now appear in Finance/Data/Analytics** *(2026-05-10)* — those pages were sourcing `filterAndTransform` (open-house required); switched to `transformAll`. Added `hasOpenHouse(start, end)` so display sites hide the "Wed, Dec 31, 1969 4:00 PM" garbage line for listings without an open house.
- **Map zones persistence** *(2026-05-08)* — fixed the auth-race that wiped zones on refresh. Gated `cloudFetch` on `authMode`, added a `loaded` guard on `persist`. Same pattern then applied to `useFinFavorites`.
- **Thumbnail lazy-fetch for new listings** *(2026-05-08)* — `/api/thumbnail/{mlsId}` now accepts `?url=` and scrapes og:image on cache miss, uploads to Blob, returns the JPEG. Subsequent requests served from Blob. SSRF-guarded to redfin.com only.
- **Open Houses page → mobile share button works** *(2026-05-08)* — earlier mobile-share work culminating in the centered-modal fix listed above.
- **Pre-push hook + vitest gate** *(2026-05-07)* — `.githooks/pre-push` runs `npm test` (110+ tests) before every push; self-installing via `prepare` script. Hook bypassable with `--no-verify` for genuine emergencies.
- **Regression test infrastructure** *(2026-05-04..05-12)* — added 116 unit tests (`vitest run`) and 28 integ tests (`scripts/test-share-plan.mjs`, `scripts/test-thumbnails.mjs`). All run on every push via the pre-push hook.
- **Vercel env var sensitivity / build-time guards** *(2026-05-05)* — `VITE_FIREBASE_*` re-added as non-sensitive; `scripts/check-build-env.mjs` fails the build if any are missing; `src/lib/firebase.ts` throws a named error at init.
- **Mobile sign-in (redirect fallback)** *(2026-05-04)* — popup-blocked path falls through to `signInWithRedirect`; binId cached in localStorage for fast subsequent loads.
- **Multi-family cap rate substring fix** *(2026-05-04)* — `"Multi-Family (2-4)"` / `"(5+)"` substring checks were missing the ` Unit` suffix from real Redfin strings, dropping the multipliers.
