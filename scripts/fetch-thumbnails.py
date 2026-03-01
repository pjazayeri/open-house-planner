#!/usr/bin/env python3
"""
Fetch listing thumbnail images from Redfin og:image tags.
Only fetches active listings with open houses (the ones shown on the dashboard).
Saves to public/thumbnails/{MLS_ID}.jpg

Usage: python3 scripts/fetch-thumbnails.py
"""

import csv
import os
import re
import time
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
CSV_PATH = os.path.join(PROJECT_DIR, "public", "redfin-favorites_2026-03-01-07-44-38.csv")
OUT_DIR = os.path.join(PROJECT_DIR, "public", "thumbnails")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
URL_COL = "URL (SEE https://www.redfin.com/buy-a-home/comparative-market-analysis FOR INFO ON PRICING)"

OG_IMAGE_RE = re.compile(r'og:image"\s+content="([^"]+)"')


def fetch_page(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode("utf-8", errors="replace")


def download_file(url: str, dest: str) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
    with open(dest, "wb") as f:
        f.write(data)
    return len(data) > 1000  # sanity check: real images are > 1KB


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Filter to active listings with open houses (matches filterListings.ts logic)
    dashboard_rows = [
        r for r in rows
        if r["STATUS"] == "Active"
        and r.get("NEXT OPEN HOUSE START TIME", "").strip()
    ]
    print(f"Found {len(dashboard_rows)} active listings with open houses")

    fetched = skipped = failed = 0

    for row in dashboard_rows:
        mls = row.get("MLS#", "").strip()
        url = row.get(URL_COL, "").strip()

        if not mls or not url:
            continue

        dest = os.path.join(OUT_DIR, f"{mls}.jpg")

        if os.path.exists(dest):
            print(f"SKIP {mls} (already exists)")
            skipped += 1
            continue

        print(f"FETCH {mls} ... ", end="", flush=True)

        try:
            html = fetch_page(url)
            match = OG_IMAGE_RE.search(html)
            if not match:
                print("FAIL (no og:image)")
                failed += 1
                time.sleep(1)
                continue

            og_url = match.group(1)
            if download_file(og_url, dest):
                print("OK")
                fetched += 1
            else:
                print("FAIL (too small)")
                os.remove(dest)
                failed += 1
        except Exception as e:
            print(f"FAIL ({e})")
            if os.path.exists(dest):
                os.remove(dest)
            failed += 1

        time.sleep(1)

    print(f"\nDone. Fetched: {fetched}, Skipped: {skipped}, Failed: {failed}")


if __name__ == "__main__":
    main()
