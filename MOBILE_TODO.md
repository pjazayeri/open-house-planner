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

- [!] **Favorite listings from the shared catalog in-app (no CSV needed)** — the daily cron already stores every SF listing + open house in Neon; users should be able to pick favorites on the phone instead of exporting a Redfin CSV on a computer. Staged: (a) ~~extend `GET /api/listings` to return full listing rows for upcoming open houses (`?catalog=1`)~~ ✅ shipped; (b) Browse page: a "Catalog" toggle that lists those rows with a ♥ favorite toggle, persisted as `favoriteIds` in `user_state` via `cloudPatch`; (c) `useListings` universe = CSV favorites ∪ `favoriteIds` (reuse `overlayOpenHouses`/`addressKey`). Each stage is its own tick. Test: favorite a catalog listing → reload → it appears on Open Houses.
- [!] **Phone-friendly CSV upload copy + accept types** — Header "↑ Upload CSV" and CsvUploadPrompt: iOS Safari saves Redfin's export to Files as `.csv`; make sure `accept` includes `.csv,text/csv,text/comma-separated-values` and the prompt explains the phone path (Redfin → Favorites → Download → Share → Save to Files → Upload here). Test: pick a CSV from Files in the simulator → listings refresh.
- [ ] **Finance page is unusable at phone width** — #finance on a 390px viewport: the "Finance — Buy vs Rent" title overlaps the Down/Rate/Opp.-return inputs, the input row overflows horizontally, the property list renders as a cramped two-column strip with a vertical "66 listings without a price hidden" gutter, and the detail panel is pushed below → expected: stack it — title row, assumptions as a 2×2 grid (or collapsible "Assumptions" bar), full-width list rows, detail as an expand/sheet. Test: at 390px no horizontal overflow; every input is reachable and the first listing's detail is visible without pinch-zoom.
- [ ] **Property cards: tighter on phones** — Browse/Open Houses list: thumbnail 120px + large padding makes ~1.3 cards fit per screen. Try a horizontal card (thumb left 96×72, price/address/meta right, actions in one row) at ≤767px. Test: ≥2.5 cards visible on a 844px-tall viewport.
- [ ] **Page switches keep the old scroll position; floating Map/List pill covers content** — scroll the Browse list, tap "Open Houses" in the bottom bar → the planner opens mid-list ("Plan a day" out of view); when scrolled, the pill sits over card headers (the "✓ Visited" badge is hidden behind it) → expected: scroll the sidebar to top on page change; shrink/fade the pill while scrolling or reserve its height. Test: Browse scrolled → Open Houses → list starts at "Plan a day"; a visited card's badge is fully visible at the top of the list.
- [ ] **Summary modal on phones: half-height sheet, text overflows, button clipped** — menu → Tour summary at 390px: the modal is a bottom-anchored sheet ~45% tall, the monospace summary runs off the right edge (rule lines are cut), and the "Generate insights" button sits behind the bottom tab bar → expected: full-height sheet above the tab bar (bottom: safe-area + nav height), `white-space: pre-wrap` text, sticky footer with the insights button. Test: no horizontal scroll inside the modal; the button is fully tappable.
- [ ] **Pull-to-refresh on the list (phones)** — Browse/Open Houses list view: drag down at the top → call `refreshListings()` with the same toast. Native `overscroll-behavior: none` is set on `html.native`, so implement with touch handlers (start at scrollTop 0, threshold ~70px, spinner row). Test: pull in the simulator → toast appears.
- [ ] **Data page table on phones** — #data: columns truncate to "4…" and the table scrolls horizontally with no sticky first column; consider a compact row layout (address + price + beds/baths) under 767px. Test: address readable without horizontal scroll.
- [ ] **Open a CSV from the iOS Share Sheet** — native: declare a CSV document type in `ios/App/App/Info.plist` (CFBundleDocumentTypes, public.comma-separated-values-text), handle `appUrlOpen` file URLs in `src/native/native.ts` via `@capacitor/filesystem` → `uploadListings`. Needs `npm run ios:ship` after. Test: Safari download → Share → "Open House" → listings update.

## Done
- [x] **Refresh listings is first-class: ↻ button + menu item, on-demand Redfin pull, status/price/open-house merge, "updated Xh ago"** — 221f052
- [x] **Compact phone shell: one-row header, bottom page tabs, floating Map/List, avatar menu, collapsed filters** — c143ae7
- [x] **Catalog favorites, stage (a): `GET /api/listings?catalog=1` returns full rows** — 6771c96
