/**
 * Integration test for the thumbnail endpoint.
 *
 * Tests /api/thumbnail/{mlsId} against production:
 *   1. Cache miss + Redfin URL → lazy-fetches og:image, returns JPEG
 *   2. Cache hit (subsequent request)  → returns JPEG
 *   3. Cache miss without URL          → returns SVG placeholder (existing behavior)
 *   4. Cache miss with non-Redfin URL  → returns SVG (SSRF guard)
 *
 * Run with: node scripts/test-thumbnails.mjs [base-url]
 *
 * NOTE: Uses a real Redfin listing URL. If Redfin removes that listing the
 * lazy-fetch test will start failing — pick another active SF listing from
 * the latest CSV. Tests use a unique mlsId each run to exercise the lazy
 * path and avoid relying on pre-existing cached state.
 */

const BASE = process.argv[2] ?? "https://open-house-planner.vercel.app";
const REDFIN_URL =
  "https://www.redfin.com/CA/San-Francisco/3446-Clay-St-94118/home/1826030";

let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}${detail ? ": " + detail : ""}`);
    failed++;
  }
}

async function fetchThumb(mlsId, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}/api/thumbnail/${mlsId}${qs ? `?${qs}` : ""}`;
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, contentType: r.headers.get("content-type"), size: buf.length };
}

async function run() {
  console.log(`\nThumbnail Integration Test — ${BASE}\n`);
  // Unique mlsId so cached state from prior runs doesn't mask a regression.
  const TEST_ID = `INTEG-${Date.now()}`;

  // ── 1. Cache miss + valid Redfin URL → lazy fetch returns JPEG ──────────
  console.log("1. Lazy fetch on cache miss");
  const r1 = await fetchThumb(TEST_ID, { url: REDFIN_URL });
  ok("returns 200", r1.status === 200, `status=${r1.status}`);
  ok("returns image/jpeg", r1.contentType?.startsWith("image/jpeg"), r1.contentType ?? "");
  ok("returns real image (>1KB)", r1.size > 1000, `size=${r1.size}`);
  ok("not the placeholder SVG", r1.contentType !== "image/svg+xml");

  // ── 2. Subsequent request hits the blob cache ───────────────────────────
  console.log("\n2. Blob cache hit on second request");
  const r2 = await fetchThumb(TEST_ID);
  ok("returns 200", r2.status === 200, `status=${r2.status}`);
  ok("returns image/jpeg", r2.contentType?.startsWith("image/jpeg"), r2.contentType ?? "");
  ok("size matches first response", r2.size === r1.size, `r1=${r1.size} r2=${r2.size}`);

  // ── 3. Cache miss without URL → placeholder SVG ─────────────────────────
  console.log("\n3. Placeholder when URL not provided");
  const r3 = await fetchThumb(`MISSING-NO-URL-${Date.now()}`);
  ok("returns 200", r3.status === 200, `status=${r3.status}`);
  ok("returns image/svg+xml", r3.contentType === "image/svg+xml", r3.contentType ?? "");

  // ── 4. SSRF guard: non-Redfin URL is rejected, falls through to SVG ─────
  console.log("\n4. SSRF guard rejects non-Redfin URLs");
  const r4 = await fetchThumb(`SSRF-${Date.now()}`, { url: "https://evil.example.com/img.jpg" });
  ok("returns 200", r4.status === 200, `status=${r4.status}`);
  ok("returns SVG (rejected, not fetched)", r4.contentType === "image/svg+xml", r4.contentType ?? "");

  console.log(`\n${"─".repeat(40)}`);
  console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
