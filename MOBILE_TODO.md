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

## Done
