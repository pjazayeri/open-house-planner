# DONE

History of shipped work. New entries go on top. When a `[PENDING VERIFICATION]` item is confirmed working, move it to `Verified shipped`. If it turns out to be broken, move it back to `TODO.md` with notes.

## Pending verification

- **Persist Open Houses filters via cloud sync** *(shipped 2026-05-11, commit a224674)*
  Added `filters` field to `CloudState`. App.tsx hydrates from cloud on signed-in mount (only if URL hash has no filter params — shared URLs still take precedence) and debounce-writes (1s) on every filter change. Guest mode is local-only.
  *Verify:* change filters → refresh → they stick; second device signed into the same account → same filters appear; shared `#share?bin=…` URL → its filter params not overwritten.

- **Finance: hover tooltips on Total/Effective/Net cost** *(shipped 2026-05-12, commit ca1249a)*
  Hover the three bold totals on the Finance detail panel — each itemizes the components that sum to it. Builders in `src/utils/financeTooltips.ts` + 7 unit tests covering the principal-toggle / HOA-zero / zero-deduction branches.
  *Verify:* hover the three rows on the Finance detail panel, breakdowns read correctly.

- **Light/dark theme tokens defined** *(shipped 2026-05-12, subtask 1/6 of light/dark mode toggle)*
  Added a `:root` block in `src/index.css` with the 17 theme variables the app uses (surfaces, text, borders, accents, shadow) plus a `:root[data-theme="light"]` override block. Default values match the existing dark palette so this is a visual no-op until subsequent commits migrate component CSS to consume the variables.
  *Verify:* site still renders identical to before — `vercel --prod` deploy. No theme switch is wired up yet (next subtask).

## Verified shipped

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
