# TODO

## Rules
- Before marking a task done, have high confidence the feature works and no regressions were introduced. If that confidence cannot be reached (e.g. no way to exercise the UI, missing test data, external service unreachable), do not remove the todo — instead leave a short note under it explaining what was done and what blocks verification.

## Tasks
- Start adding unit tests for every feature we touch going forward. *(ongoing guidance — applying to every change)*
- Persist the filters set on the Open Houses page as a user setting so they survive page revisits and sync across devices (via JSONBin cloud sync, not just localStorage).
- Revisit the data model: start moving appropriate data to SQL, and separate user-specific data from user-agnostic data. Reconsider whether public listing data should live under user data at all. *(architectural — needs discussion before implementation)*
- Add server/client logging to help debug issues. Logs must be accessible to Claude during dev cycles (e.g. via `vercel logs` or a queryable store), but must never expose secrets to end users.
- Rework Demo Mode: it shouldn't be a shared "plan" — it should be the same experience as Guest Mode but with pre-seeded listings/visits/priorities so users can explore the full app.
- Add a light/dark mode toggle (persist as a user setting).
