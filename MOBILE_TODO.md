# Mobile UX backlog

Feeds the two hourly loops (eval + build) that run from a local Claude Code
session. Humans may add items too — anything you notice on the phone goes here.

## Rules
- **Eval loop** (hourly): drives the production site in a phone-sized Chrome
  viewport (demo mode, every page), reads console errors, and re-ranks this
  file. It adds at most 3 new items per tick, each with a concrete repro and a
  one-line acceptance test, and removes items that are no longer true. It does
  not write code.
- **Build loop** (hourly, offset by 30 min): takes the top `[ ]` item, implements
  it with a unit test where feasible, verifies in the phone viewport, runs
  `tsc -b` + `vitest`, commits **only the files it touched**, pushes to main
  (Vercel auto-deploys; the iOS shell loads the live site). One item per tick.
  Moves the item to **Done** with the commit hash. Never touches secrets,
  never rewrites unrelated uncommitted work.
- Priority is top-down. `[!]` = user-reported, always first.

## Backlog

- [ ] **Page switches keep the old scroll position; floating Map/List pill covers content** — scroll the Browse list, tap "Open Houses" in the bottom bar → the planner opens mid-list ("Plan a day" out of view); when scrolled, the pill sits over card headers (the "✓ Visited" badge is hidden behind it) → expected: scroll the sidebar to top on page change; shrink/fade the pill while scrolling or reserve its height. Test: Browse scrolled → Open Houses → list starts at "Plan a day"; a visited card's badge is fully visible at the top of the list.
- [ ] **Summary modal on phones: half-height sheet, text overflows, button clipped** — menu → Tour summary at 390px: the modal is a bottom-anchored sheet ~45% tall, the monospace summary runs off the right edge (rule lines are cut), and the "Generate insights" button sits behind the bottom tab bar → expected: full-height sheet above the tab bar (bottom: safe-area + nav height), `white-space: pre-wrap` text, sticky footer with the insights button. Test: no horizontal scroll inside the modal; the button is fully tappable.
- [ ] **Light theme is only half-applied on phones** — menu → "Light mode" at 390px: the bottom sheet, cards and filter pane turn light but the header (city title + stats) and the bottom tab bar stay dark navy, so the label flips to "Dark mode" while the shell still looks dark → expected: header, bottom nav, floating Map/List pill and status bar all follow `data-theme` (they read `var(--bg)`; check for a hard-coded background or a stale `data-theme` write on <html>). Test: after tapping Light mode, `getComputedStyle(header).backgroundColor` is the light `--bg` and the bottom nav text is dark.
- [ ] **Cluster bubbles in adjacent grid cells overlap each other and nearby pins** — Browse map at 390px, default zoom: bubbles like ×16 / ×13 / ×2 sit in neighbouring 56px cells and half-cover each other and single pins (e.g. #38, #9) → expected: merge clusters whose centroids are < 44px apart (second pass) or scale the cell size with pin density at low zoom, so no two bubbles/pins overlap by more than 30%. Test: at default zoom every bubble's centre is ≥ 44px from any other marker centre.
- [ ] **Rating stars are ~28px tap targets** — Open Houses → "Mark as visited" on a card → the 1–5 ★ row: each star is ~28px wide with no padding, the 👍/👎 buttons are 40px → expected: ≥44px hit area per star (padding, not glyph size), 4–6px gaps, and a pressed state. Test: at 390px, tapping between two stars never selects the wrong one; hit area measured ≥40px in devtools.
- [ ] **Pull-to-refresh on the list (phones)** — Browse/Open Houses list view: drag down at the top → call `refreshListings()` with the same toast. Native `overscroll-behavior: none` is set on `html.native`, so implement with touch handlers (start at scrollTop 0, threshold ~70px, spinner row). Test: pull in the simulator → toast appears.
- [ ] **Share plan should use the phone's share sheet** — Open Houses → menu → "Share this plan": a bare two-row dropdown (Full plan / Map only · Open · Copy) with no title, and "Copy" gives no confirmation → expected: on phones call `navigator.share({ title, url })` with the full-plan link (fallback to the modal when unsupported), title the modal "Share your tour", and flash "Copied" on the Copy buttons. Test: on iOS the system share sheet opens; in Chrome desktop the modal still appears and Copy shows "Copied" for ~1.5s.
- [ ] **Finance detail view: hide the search/sort row** — Finance → tap a listing at 390px: the header keeps the title, Assumptions bar, search + sort chips and the back bar (~200px) above the detail, and search/sort are irrelevant while reading one listing → expected: in `fp-body--detail` hide the sort row (keep Assumptions since it changes the numbers) so the detail gets ~50px more. Test: at 390×844 the detail card's hero is visible without scrolling after tapping a row.
- [ ] **Data page table on phones** — #data: columns truncate to "4…" and the table scrolls horizontally with no sticky first column; consider a compact row layout (address + price + beds/baths) under 767px. Test: address readable without horizontal scroll.
- [ ] **Open a CSV from the iOS Share Sheet** — native: declare a CSV document type in `ios/App/App/Info.plist` (CFBundleDocumentTypes, public.comma-separated-values-text), handle `appUrlOpen` file URLs in `src/native/native.ts` via `@capacitor/filesystem` → `uploadListings`. Needs `npm run ios:ship` after. Test: Safari download → Share → "Open House" → listings update.

## Done
- [x] **Planner top stack pushes the first card ~300px down** — b709cad: one-row day chips + 📍 icon
- [x] **Browse map: 50+ numbered pins overlap at city zoom** — 86d4d15: grid clustering below zoom 15 on phones, tap to zoom
- [x] **Property cards: tighter on phones** — bdf1cae: horizontal grid card, ~2.7 per screen
- [x] **Map tiles are grey for 5+ seconds on a cold load** — 6958a7c: Esri CDN basemap + keepBuffer + light loading ground
- [x] **Leaving the map during its zoom animation throws a Leaflet exception** — 6baa767. Note for evals: the "first tap swallowed" part was a browser-automation artifact (the first synthetic click after a navigation never lands, at any delay; a `find`/screenshot first fixes it) — not an app bug.
- [x] **Finance page is unusable at phone width** — a90be05: assumptions bar + stacked list/detail
- [x] **Phone-friendly CSV upload copy + accept types** — 3995ac2
- [x] **Favorite listings from the shared catalog in-app (no CSV needed)** — stages (a) 6771c96, (b) 96b8c08, (c) 88dcdac: hearted listings join Browse + Open Houses; "Browse the catalog instead" skips the CSV entirely
- [x] **Catalog favorites, stage (b): Browse → Catalog view with ♥ saved to `favoriteIds`** — 96b8c08
- [x] **Refresh listings is first-class: ↻ button + menu item, on-demand Redfin pull, status/price/open-house merge, "updated Xh ago"** — 221f052
- [x] **Compact phone shell: one-row header, bottom page tabs, floating Map/List, avatar menu, collapsed filters** — c143ae7
- [x] **Catalog favorites, stage (a): `GET /api/listings?catalog=1` returns full rows** — 6771c96
