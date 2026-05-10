# TODO

## Rules
- Before marking a task done, have high confidence the feature works and no regressions were introduced. If that confidence cannot be reached (e.g. no way to exercise the UI, missing test data, external service unreachable), do not remove the todo — instead leave a short note under it explaining what was done and what blocks verification.

## Tasks
- Fix Favorites filter on the Finance page — it currently isn't filtering anything.
  - **Work done:** `useFinFavorites` had the same auth-race + clobber-on-write bug as `useMapZones`. Hook now gates the initial `cloudFetch` on `authMode` and a `loaded` flag prevents `toggleFinFavorite` from writing until the fetch resolves (so an empty local state can't overwrite the cloud copy). See commit on branch.
  - **Verification blocked by:** can't drive the UI from this session; the regression unit test covers the failure mode but I haven't confirmed in the live app. Leaving open until you confirm Favorites filter behaves correctly after deploy.
- Start adding unit tests for every feature we touch going forward. *(ongoing guidance — applying to every change)*
- Add a unit test for the Favorites filter (covering the Finance page fix above).
  - **Work done:** `src/hooks/useFinFavorites.test.tsx` covers (1) no fetch while authMode is loading, (2) loads existing ids when ready, (3) toggle is a no-op pre-load so cloud isn't clobbered, (4) toggle add/remove round-trip. All passing.
- Persist the filters set on the Open Houses page as a user setting so they survive page revisits and sync across devices (via JSONBin cloud sync, not just localStorage).
- Revisit the data model: start moving appropriate data to SQL, and separate user-specific data from user-agnostic data. Reconsider whether public listing data should live under user data at all. *(architectural — needs discussion before implementation)*
- Share Plan is broken — it doesn't work at all right now. Investigate and fix end-to-end.
  - **Work done:** Found a likely cause — the portaled dropdown had `z-index: 200` but `.header` is `z-index: 1000`, so when the dropdown landed near the header's bottom edge it was painted underneath. Bumped the `--portal` variant to `z-index: 3000` (above the header and the bottom-right toast).
  - **Verification blocked by:** needs hard refresh on mobile to bust the cached bundle. Leaving open until you confirm the dropdown is now visible after tapping Share Plan.
- Add server/client logging to help debug issues. Logs must be accessible to Claude during dev cycles (e.g. via `vercel logs` or a queryable store), but must never expose secrets to end users.
- Rework Demo Mode: it shouldn't be a shared "plan" — it should be the same experience as Guest Mode but with pre-seeded listings/visits/priorities so users can explore the full app.
