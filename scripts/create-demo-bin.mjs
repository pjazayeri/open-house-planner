/**
 * One-shot script to (re)create the demo plan bin used by AuthScreen's
 * "View Demo" button. The previous demo bin included a Tuesday open-house
 * group which shifted onto a weekday for users viewing it — that's not what
 * an open-house demo should ever show.
 *
 * After running this, copy the printed bin id into
 *   src/components/Auth/AuthScreen.tsx → DEMO_BIN_ID
 *
 * Usage: node scripts/create-demo-bin.mjs [base-url]
 */

const BASE = process.argv[2] ?? "https://open-house-planner.vercel.app";

// Source weekend (Saturday + Sunday). shiftPlanToFuture rolls these forward
// in whole-week increments so they always land on Sat/Sun for viewers.
const SATURDAY = "2026-05-09";
const SUNDAY = "2026-05-10";

const iso = (date, hourPT) => {
  // PT is UTC-7 (PDT). 11 AM PT = 18:00 UTC; 2 PM PT = 21:00 UTC.
  return `${date}T${String(hourPT + 7).padStart(2, "0")}:00:00.000Z`;
};

const DEMO_PLAN = [
  {
    label: `Saturday, May 9 · 11:00 AM - 1:00 PM (2 homes)`,
    start: iso(SATURDAY, 11),
    end: iso(SATURDAY, 13),
    listings: [
      {
        id: "426121056",
        addr: "1151 Fell St",
        loc: "SF District 6",
        city: "San Francisco",
        price: 1799000,
        beds: 3,
        baths: 3,
        sqft: null,
        hoa: 335,
        start: iso(SATURDAY, 11),
        end: iso(SATURDAY, 13),
        url: "https://www.redfin.com/CA/San-Francisco/1151-1153-Fell-St-94117/home/187353736",
        cap: 5.78,
        lat: 37.773918,
        lng: -122.436796,
      },
      {
        id: "426116902",
        addr: "1310 Fillmore St #703",
        loc: "SF District 6",
        city: "San Francisco",
        price: 1199000,
        beds: 2,
        baths: 2,
        sqft: 1407,
        hoa: 973,
        start: iso(SATURDAY, 11),
        end: iso(SATURDAY, 13),
        url: "https://www.redfin.com/CA/San-Francisco/1310-Fillmore-St-94115/unit-703/home/17306829",
        cap: 5.03,
        lat: 37.7816368,
        lng: -122.4316953,
      },
    ],
  },
  {
    label: `Saturday, May 9 · 1:30 PM - 3:30 PM (1 home)`,
    start: iso(SATURDAY, 13) + "_30",  // placeholder, see below
    end: iso(SATURDAY, 15) + "_30",
    listings: [],
  },
  {
    label: `Sunday, May 10 · 2:00 PM - 4:00 PM (1 home)`,
    start: iso(SUNDAY, 14),
    end: iso(SUNDAY, 16),
    listings: [
      {
        id: "ML82043823",
        addr: "1502 Golden Gate Ave",
        loc: "San Francisco",
        city: "San Francisco",
        price: 2850000,
        beds: 4,
        baths: 2.5,
        sqft: 2466,
        hoa: null,
        start: iso(SUNDAY, 14),
        end: iso(SUNDAY, 16),
        url: "https://www.redfin.com/CA/San-Francisco/1502-Golden-Gate-Ave-94115/home/198877",
        cap: 4.21,
        lat: 37.778108,
        lng: -122.4366,
      },
    ],
  },
];

// Fix the second group properly (couldn't do "_30" in template — redo).
const SAT_130_START = "2026-05-09T20:30:00.000Z"; // 1:30 PM PT
const SAT_330_END = "2026-05-09T22:30:00.000Z"; // 3:30 PM PT
DEMO_PLAN[1] = {
  label: `Saturday, May 9 · 1:30 PM - 3:30 PM (1 home)`,
  start: SAT_130_START,
  end: SAT_330_END,
  listings: [
    {
      id: "ML82043512",
      addr: "1515 Union St Unit 4G",
      loc: "San Francisco",
      city: "San Francisco",
      price: 1300000,
      beds: 1,
      baths: 1,
      sqft: 913,
      hoa: 1640,
      start: SAT_130_START,
      end: SAT_330_END,
      url: "https://www.redfin.com/CA/San-Francisco/Union-St-94123/home/171931351",
      cap: 4.49,
      lat: 37.798304,
      lng: -122.4243186,
    },
  ],
};

const r = await fetch(`${BASE}/api/share`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(DEMO_PLAN),
});
if (!r.ok) {
  console.error("Failed:", r.status, await r.text());
  process.exit(1);
}
const { id } = await r.json();
console.log(`\nNew demo bin id: ${id}`);
console.log(`Update src/components/Auth/AuthScreen.tsx — set DEMO_BIN_ID = "${id}"\n`);
console.log(`Verify with: curl -s "${BASE}/api/plan?id=${id}" | python3 -m json.tool | head -5`);
