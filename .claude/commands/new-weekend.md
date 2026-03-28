---
description: Fully automated new-weekend update — find CSV, ingest it, verify listings and thumbnails.
---

You are fully automating the new-weekend update. Do not ask the user to open a browser or click anything — handle it all via CLI. Follow each step exactly.

## Step 1 — Find the CSV

Look for CSVs in the workspace `tmp/` folder:

```bash
ls -t tmp/redfin-favorites_*.csv 2>/dev/null | head -5
```

Pick the most recently modified one. If there are multiple, show the list and ask which to use. If none found, tell the user to:
1. Export from Redfin (Favorites → Export to CSV)
2. Save the file into the `tmp/` folder in this workspace (create it if needed: `mkdir -p tmp`)
3. Re-run `/new-weekend`

## Step 2 — Get the production URL

Run:
```bash
vercel ls --scope team_wAwtGnO9FZlBF2rDZrk5kiZC 2>/dev/null | grep open-house-planner | head -3
```

If that fails or is slow, just use `https://open-house-planner.vercel.app` as the base URL.

## Step 3 — Ingest the CSV via POST /api/ingest

POST the CSV file body directly to the ingest endpoint:

```bash
curl -s -X POST "https://open-house-planner.vercel.app/api/ingest" \
  -H "Content-Type: text/csv" \
  --data-binary "@<CSV_PATH>" | jq .
```

Replace `<CSV_PATH>` with the path found in Step 1. If `jq` is not available, omit `| jq .`.

The response JSON looks like:
```json
{ "csvUrl": "...", "thumbnails": { "fetched": 3, "skipped": 12, "failed": 0 }, "deleted": 2 }
```

Show the user the counts: how many thumbnails fetched, skipped, failed, and how many stale ones deleted.

If the response is an error (non-200 or `{ "error": ... }`), diagnose it:
- 401/403: credentials issue — tell user to check Vercel env vars
- 400 "Empty CSV body": the file path was wrong or file is empty
- Network error: check internet connection or try `vercel dev` locally

## Step 4 — Verify listing count

After a successful ingest, run:

```bash
curl -s "https://open-house-planner.vercel.app/api/csv" | head -c 500
```

This confirms the new CSV is live. Count the lines (or show a snippet) to verify it looks right.

If `/api/csv` returns an error, run `node scripts/test-jsonbin.mjs` to check sync credentials separately.

## Step 5 — Sync any missing thumbnails (if fetched count was lower than expected)

If `failed > 0` from Step 3, offer to run the CLI sync script which retries with a longer timeout:

```bash
node scripts/sync-thumbnails.mjs
```

This reads from Vercel Blob directly and uploads any still-missing thumbnails.

## Step 6 — Report results

Summarize what happened:
- Which CSV was ingested (filename + date)
- Active listing count (from CSV line count)
- Thumbnail counts (fetched / skipped / failed / deleted)
- Any follow-up actions needed

Do NOT commit or push anything — ingest via Blob doesn't require a deploy.
