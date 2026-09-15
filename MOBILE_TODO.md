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

- [?] **Light theme is only half-applied on phones** — *Checked 2026-09-14 in the built app: the header and bottom nav DO follow `data-theme` (computed bg = light `--bg`); the earlier observation was wrong. What stays dark in light mode is Finance / Data / Analytics / Summary, whose CSS is hard-coded dark (`#0f172a`, `#1e293b`) — the same migration TODO.md marks NEEDS DISCUSSION.* **Question for the user:** migrate those pages to theme tokens (a sizeable CSS pass, cards flip to dark in dark mode), or hide the Light/Dark item from the phone menu until then?
- [ ] **Pull-to-refresh on the list (phones)** — Browse/Open Houses list view: drag down at the top → call `refreshListings()` with the same toast. Native `overscroll-behavior: none` is set on `html.native`, so implement with touch handlers (start at scrollTop 0, threshold ~70px, spinner row). Test: pull in the simulator → toast appears.
- [ ] **Share plan should use the phone's share sheet** — Open Houses → menu → "Share this plan": a bare two-row dropdown (Full plan / Map only · Open · Copy) with no title, and "Copy" gives no confirmation → expected: on phones call `navigator.share({ title, url })` with the full-plan link (fallback to the modal when unsupported), title the modal "Share your tour", and flash "Copied" on the Copy buttons. Test: on iOS the system share sheet opens; in Chrome desktop the modal still appears and Copy shows "Copied" for ~1.5s.
- [ ] **Finance detail view: hide the search/sort row** — Finance → tap a listing at 390px: the header keeps the title, Assumptions bar, search + sort chips and the back bar (~200px) above the detail, and search/sort are irrelevant while reading one listing → expected: in `fp-body--detail` hide the sort row (keep Assumptions since it changes the numbers) so the detail gets ~50px more. Test: at 390×844 the detail card's hero is visible without scrolling after tapping a row.
- [ ] **Data page table on phones** — #data: columns truncate to "4…" and the table scrolls horizontally with no sticky first column; consider a compact row layout (address + price + beds/baths) under 767px. Test: address readable without horizontal scroll.
- [ ] **Open a CSV from the iOS Share Sheet** — native: declare a CSV document type in `ios/App/App/Info.plist` (CFBundleDocumentTypes, public.comma-separated-values-text), handle `appUrlOpen` file URLs in `src/native/native.ts` via `@capacitor/filesystem` → `uploadListings`. Needs `npm run ios:ship` after. Test: Safari download → Share → "Open House" → listings update.

## Done
- [x] **Rating stars are ~28px tap targets** — 5344cd0: 44×44 stars + thumbs on phones
- [x] **Cluster bubbles in adjacent grid cells overlap each other and nearby pins** — b2bf53b: mergeNearby pass, min centre distance 45px
- [x] **Summary modal on phones: half-height sheet, text overflows, button clipped** — 2e61ee9
- [x] **Planner map: clusters hide the tour-stop numbers along the route** — 8aaa039: stop-range bubbles + next stop pinned
- [x] **Page switches keep the old scroll position; floating Map/List pill covers content** — da23921: scroll-to-top on page change, hide-on-scroll pill
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
