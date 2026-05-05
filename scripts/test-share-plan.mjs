/**
 * Integration test for the share plan flow.
 *
 * Tests POST /api/share → GET /api/plan roundtrip against the production URL.
 * Run with: node scripts/test-share-plan.mjs [base-url]
 * Default base URL: https://open-house-planner.vercel.app
 */

const BASE = process.argv[2] ?? "https://open-house-planner.vercel.app";

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

const SAMPLE_PLAN = [
  {
    label: "Saturday, Jun 14 · 11:00 AM - 1:00 PM (2 homes)",
    start: "2026-06-14T18:00:00.000Z",
    end: "2026-06-14T20:00:00.000Z",
    listings: [
      {
        id: "TEST001",
        addr: "100 Main St",
        loc: "Pacific Heights",
        city: "San Francisco",
        price: 1500000,
        beds: 3,
        baths: 2,
        sqft: 1400,
        hoa: null,
        start: "2026-06-14T18:00:00.000Z",
        end: "2026-06-14T20:00:00.000Z",
        url: "https://www.redfin.com/test",
        cap: 3.8,
        lat: 37.7928,
        lng: -122.4359,
      },
      {
        id: "TEST002",
        addr: "200 Oak Ave",
        loc: "Noe Valley",
        city: "San Francisco",
        price: 1200000,
        beds: 2,
        baths: 2,
        sqft: 1100,
        hoa: 450,
        start: "2026-06-14T18:00:00.000Z",
        end: "2026-06-14T20:00:00.000Z",
        url: "https://www.redfin.com/test2",
        cap: 4.1,
        lat: 37.7502,
        lng: -122.4337,
      },
    ],
  },
  {
    label: "Sunday, Jun 15 · 2:00 PM - 4:00 PM (1 home)",
    start: "2026-06-15T21:00:00.000Z",
    end: "2026-06-15T23:00:00.000Z",
    listings: [
      {
        id: "TEST003",
        addr: "300 Pine St",
        loc: "Russian Hill",
        city: "San Francisco",
        price: 2100000,
        beds: 4,
        baths: 3,
        sqft: 2200,
        hoa: null,
        start: "2026-06-15T21:00:00.000Z",
        end: "2026-06-15T23:00:00.000Z",
        url: "https://www.redfin.com/test3",
        cap: 5.2,
        lat: 37.8013,
        lng: -122.4187,
      },
    ],
  },
];

async function run() {
  console.log(`\nShare Plan Integration Test — ${BASE}\n`);

  // ── 1. POST /api/share creates a new plan ─────────────────────────────────
  console.log("1. Create share");
  let shareId;
  try {
    const r = await fetch(`${BASE}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SAMPLE_PLAN),
    });
    ok("POST /api/share returns 200", r.status === 200, `status=${r.status}`);
    const body = await r.json();
    ok("Response has id field", typeof body.id === "string" && body.id.length > 0, JSON.stringify(body));
    shareId = body.id;
  } catch (e) {
    ok("POST /api/share reachable", false, String(e));
  }

  // ── 2. GET /api/plan returns the stored plan ──────────────────────────────
  console.log("\n2. Read back plan");
  if (shareId) {
    const r = await fetch(`${BASE}/api/plan?id=${shareId}`);
    ok("GET /api/plan returns 200", r.status === 200, `status=${r.status}`);

    if (r.ok) {
      const plan = await r.json();
      ok("Plan is an array", Array.isArray(plan), typeof plan);
      ok("Plan has 2 groups", plan.length === 2, `got ${plan.length}`);
      ok("First group has correct label", plan[0].label === SAMPLE_PLAN[0].label, plan[0]?.label);
      ok("First group has 2 listings", plan[0].listings?.length === 2, `got ${plan[0].listings?.length}`);
      ok("Listing fields preserved (id)", plan[0].listings[0].id === "TEST001");
      ok("Listing fields preserved (price)", plan[0].listings[0].price === 1500000);
      ok("Listing fields preserved (cap rate)", plan[0].listings[0].cap === 3.8);
      ok("Second group has 1 listing", plan[1].listings?.length === 1);
    }
  } else {
    ok("Skipped (no share id)", false, "share creation failed");
  }

  // ── 3. GET /api/plan with missing id returns 400 ─────────────────────────
  console.log("\n3. Error handling");
  const missingR = await fetch(`${BASE}/api/plan`);
  ok("GET /api/plan with no id returns 400", missingR.status === 400, `status=${missingR.status}`);

  const bogusR = await fetch(`${BASE}/api/plan?id=000000000000000000000000`);
  ok("GET /api/plan with bogus id returns 4xx", bogusR.status >= 400, `status=${bogusR.status}`);

  // ── 4. POST /api/share with non-POST method returns 405 ──────────────────
  const methodR = await fetch(`${BASE}/api/share`);
  ok("GET /api/share returns 405", methodR.status === 405, `status=${methodR.status}`);

  // ── 5. Demo bin is accessible ─────────────────────────────────────────────
  console.log("\n4. Demo bin");
  const DEMO_BIN_ID = "69f8cdb4856a682189a62f92";
  const demoR = await fetch(`${BASE}/api/plan?id=${DEMO_BIN_ID}`);
  ok("Demo plan is readable", demoR.status === 200, `status=${demoR.status}`);
  if (demoR.ok) {
    const demo = await demoR.json();
    ok("Demo plan has at least one group", Array.isArray(demo) && demo.length > 0);
    ok("Demo group has listings", demo[0]?.listings?.length > 0);
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
