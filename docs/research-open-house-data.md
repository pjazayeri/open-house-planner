# Research: a free, schedulable open-house data source

**Date:** 2026-05-24
**Question:** Can we refresh open-house *times* automatically (on a schedule, for free)
so the weekly Redfin-favorites re-upload becomes rare?

## Verdict: YES — Redfin regional `gis-csv`, fetched from a Vercel cron.

## What was tested

1. **Endpoint** (SF):
   `GET https://www.redfin.com/stingray/api/gis-csv?al=1&market=sanfrancisco&num_homes=350&ord=redfin-recommended-asc&page_number=1&region_id=17151&region_type=6&sf=1,2,3,5,6,7&status=9&uipt=1,2,3,4,5,6,7,8&v=8`
   (needs a browser `User-Agent`; default curl/UA-less requests are rejected.)
2. **From a residential IP** (local): `200`, `text/csv`, 102 KB, **351 rows, 201 with `NEXT OPEN HOUSE START TIME`**. Columns are *identical* to the favorites export we already parse (`ADDRESS`, `STATUS`, `NEXT OPEN HOUSE START/END TIME`, `MLS#`, `LATITUDE/LONGITUDE`, `PRICE`, …).
3. **From a Vercel datacenter IP** (temporary `api/spike-redfin.ts`, since removed): **`WORKS_FROM_VERCEL`** — `200`, valid CSV, 351 rows / 201 OH, ~500 ms, via CloudFront. **Not bot-blocked.** This was the main risk; it's clear.

## Key facts

- **Format:** same `gis-csv` schema as the favorites export → reuse `src/utils/parseCsv.ts` as-is. No new parser.
- **Coverage cap:** `num_homes` caps a page at ~350. SF has more active listings, so to capture *all* open houses either **paginate** (`page_number=1,2,…`, ~a handful of pages for SF) or pull pages and **filter client-side** to rows with a non-empty open-house time. (`ooh=true` does **not** filter to open-houses — it was a no-op; the real OH-only filter param wasn't found, so pagination is the reliable path.)
- **Region:** SF = `region_id=17151&region_type=6`. Other markets need their own `region_id`.
- **Cadence:** open houses post a few days ahead → a daily (or twice-weekly) Vercel cron is plenty.

## Recommendation

Adopt **Redfin regional `gis-csv` via a Vercel cron** as the open-house source (free, no API key, reuses our parser, proven to work from Vercel). Wire it into the **[HARD] Neon listing/open-house catalog**:

- Cron (daily) fetches the SF `gis-csv` (paginated to cover all), upserts `listings` + appends `open_houses` rows keyed by normalized address.
- Client reads open-house times from Neon. **CSV upload stays only as "sync my favorites list"** — we still need it to learn *which* homes you've favorited (can't read your Redfin favorites without your login), but no longer to refresh *times*. That's the time-suck removed.

## Caveats / risks

- Unofficial endpoint → ToS-grey and could change/break. Low volume (a few requests/day) keeps risk low; we already scrape Redfin for thumbnails. **Fallback if it breaks:** per-favorite page fetch (we store each listing's Redfin URL) or a paid listings API.
- Region-specific; multi-market support needs a `region_id` lookup.

## Next step

Build the **[HARD]** Neon catalog with a Vercel cron ingester — the "ingestion source of truth" open question is now answered (Redfin `gis-csv` cron, with manual CSV upload kept as fallback + favorites discovery).
