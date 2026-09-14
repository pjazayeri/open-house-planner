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

- [!] **Favorite listings from the shared catalog in-app (no CSV needed)** — the daily cron already stores every SF listing + open house in Neon; users should be able to pick favorites on the phone instead of exporting a Redfin CSV on a computer. Staged: (a) extend `GET /api/listings` (keep the function count at 12 — no new function) to also return full listing rows for upcoming open houses (`?catalog=1`); (b) Browse page: a "Catalog" toggle that lists those rows with a ♥ favorite toggle, persisted as `favoriteIds` in `user_state` via `cloudPatch`; (c) `useListings` universe = CSV favorites ∪ `favoriteIds` (reuse `overlayOpenHouses`/`addressKey`). Each stage is its own tick. Test: favorite a catalog listing → reload → it appears on Open Houses.
- [!] **Phone-friendly CSV upload copy + accept types** — Header "↑ Upload CSV" and CsvUploadPrompt: iOS Safari saves Redfin's export to Files as `.csv`; make sure `accept` includes `.csv,text/csv,text/comma-separated-values` and the prompt explains the phone path (Redfin → Favorites → Download → Share → Save to Files → Upload here). Test: pick a CSV from Files in the simulator → listings refresh.
- [ ] **Open a CSV from the iOS Share Sheet** — native: declare a CSV document type in `ios/App/App/Info.plist` (CFBundleDocumentTypes, public.comma-separated-values-text), handle `appUrlOpen` file URLs in `src/native/native.ts` via `@capacitor/filesystem` → `uploadListings`. Needs `npm run ios:ship` after. Test: Safari download → Share → "Open House" → listings update.

## Done
