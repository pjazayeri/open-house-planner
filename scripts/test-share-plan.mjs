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

  // ── 5. Demo bin (the "View Demo" button on AuthScreen) ──────────────────
  // The AuthScreen demo button opens `/#share?bin=${DEMO_BIN_ID}`, the SPA
  // reads that hash, and fetches /api/plan?id=${DEMO_BIN_ID}. Verify the
  // full data contract that path depends on so a renamed/deleted demo bin
  // or a missing required field breaks CI loudly instead of silently
  // showing an empty plan.
  console.log("\n4. Demo bin (View Demo button data contract)");
  // Must match AuthScreen.tsx's exported DEMO_BIN_ID.
  const DEMO_BIN_ID = "6a00dfd7c0954111d804071d";
  const demoR = await fetch(`${BASE}/api/plan?id=${DEMO_BIN_ID}`);
  ok("Demo plan is readable", demoR.status === 200, `status=${demoR.status}`);
  if (demoR.ok) {
    const demo = await demoR.json();
    ok("Demo plan is an array", Array.isArray(demo), typeof demo);
    ok("Demo plan has at least one group", Array.isArray(demo) && demo.length > 0);
    ok("Demo group has listings", demo[0]?.listings?.length > 0);

    // PlanView + MapPlanView require these fields per listing. Missing any
    // would render broken cards / dots-without-coordinates on mobile maps.
    const REQUIRED_LISTING_FIELDS = [
      "id", "addr", "city", "price", "beds", "baths",
      "start", "end", "url", "lat", "lng",
    ];
    const allListings = demo.flatMap((g) => g.listings ?? []);
    ok("Demo has multiple listings to render", allListings.length >= 2, `got ${allListings.length}`);

    const missingField = REQUIRED_LISTING_FIELDS.find((f) =>
      !allListings.every((l) => l[f] !== undefined && l[f] !== null && l[f] !== "")
    );
    ok(
      `Every demo listing has all required fields (${REQUIRED_LISTING_FIELDS.join(", ")})`,
      !missingField,
      missingField ? `missing: ${missingField}` : ""
    );

    // Lat/lng must be valid numbers — map view filters out malformed coords.
    const badCoord = allListings.find(
      (l) => typeof l.lat !== "number" || typeof l.lng !== "number" || isNaN(l.lat) || isNaN(l.lng)
    );
    ok("Demo listings have numeric lat/lng for map view", !badCoord, badCoord ? `bad: ${badCoord.id}` : "");

    // start/end must be ISO strings — App.tsx's shiftPlanToFuture parses them.
    const badTime = allListings.find((l) => isNaN(Date.parse(l.start)) || isNaN(Date.parse(l.end)));
    ok("Demo listings have parseable start/end timestamps", !badTime, badTime ? `bad: ${badTime.id}` : "");

    // Open houses happen on weekends — this catches the "demo links me to
    // Tuesday May 12" regression. Anything that lands on a weekday in the
    // source plan will shift forward by full weeks (via shiftPlanToFuture)
    // and stay on a weekday for viewers.
    const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekdayGroups = demo.filter((g) => {
      const day = new Date(g.start).getUTCDay();
      return day !== 0 && day !== 6; // 0 = Sun, 6 = Sat
    });
    ok(
      "Every demo group falls on a weekend (Sat/Sun)",
      weekdayGroups.length === 0,
      weekdayGroups.length
        ? `weekday groups: ${weekdayGroups.map((g) => WEEKDAYS[new Date(g.start).getUTCDay()] + " " + g.label.slice(0, 30)).join("; ")}`
        : ""
    );
  }

  // ── 6. Mobile UA gets identical response (catches UA-sniffing regressions) ─
  console.log("\n5. Mobile parity");
  const mobileUA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
  const mobilePlanR = await fetch(`${BASE}/api/plan?id=${DEMO_BIN_ID}`, { headers: { "User-Agent": mobileUA } });
  ok("Mobile UA gets demo plan", mobilePlanR.status === 200, `status=${mobilePlanR.status}`);
  const mobileSpaR = await fetch(`${BASE}/`, { headers: { "User-Agent": mobileUA } });
  ok("Mobile UA gets SPA HTML", mobileSpaR.status === 200, `status=${mobileSpaR.status}`);
  const html = await mobileSpaR.text();
  ok("Mobile SPA HTML loads the JS bundle", /\/assets\/index-[A-Za-z0-9_-]+\.js/.test(html));

  // ── 7. URL pattern translation: `/#share?bin=ID` must map to /api/plan?id=ID ─
  // The hash-to-API mapping is parsed in App.tsx; if those param names
  // diverge, every shared link silently 400s.
  console.log("\n6. URL pattern translation");
  // Round-trip: create a share, then verify both `?id=` (API) works.
  const sharePayload = JSON.stringify(SAMPLE_PLAN);
  const created = await fetch(`${BASE}/api/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: sharePayload,
  });
  if (created.ok) {
    const { id: createdId } = await created.json();
    const idR = await fetch(`${BASE}/api/plan?id=${createdId}`);
    ok("New share is fetchable via ?id= (matches App.tsx fetch URL)", idR.status === 200, `status=${idR.status}`);
    // The client URL is /#share?bin=ID; the param name in the SPA hash is `bin`,
    // but the API itself only accepts `id`. The SPA does the translation. If
    // someone changes the API to require `bin`, this guard catches it.
    const binR = await fetch(`${BASE}/api/plan?bin=${createdId}`);
    ok("API does not silently accept ?bin= (would mask broken hash parsing)", binR.status === 400, `status=${binR.status}`);
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
