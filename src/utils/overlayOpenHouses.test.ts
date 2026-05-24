import { describe, it, expect } from "vitest";
import type { RawListing } from "../types";
import { overlayOpenHouses } from "./overlayOpenHouses";

function row(address: string, city: string, start = "", end = ""): RawListing {
  return {
    ADDRESS: address,
    CITY: city,
    "NEXT OPEN HOUSE START TIME": start,
    "NEXT OPEN HOUSE END TIME": end,
    "MLS#": "M1",
  } as unknown as RawListing;
}

describe("overlayOpenHouses", () => {
  it("overlays fresh times onto a matching row", () => {
    const rows = [row("100 Main St", "San Francisco", "Jan-01-2020 01:00 PM", "Jan-01-2020 03:00 PM")];
    const catalog = {
      "100 main st|san francisco": { start: "May-24-2026 11:00 AM", end: "May-24-2026 01:00 PM", mlsId: "X" },
    };
    const { rows: out, matched } = overlayOpenHouses(rows, catalog);
    expect(matched).toBe(1);
    expect(out[0]["NEXT OPEN HOUSE START TIME"]).toBe("May-24-2026 11:00 AM");
    expect(out[0]["NEXT OPEN HOUSE END TIME"]).toBe("May-24-2026 01:00 PM");
  });

  it("matches despite address formatting differences (Street vs St)", () => {
    const rows = [row("100 Main Street", "San Francisco", "old", "old")];
    const catalog = { "100 main st|san francisco": { start: "fresh", end: "fresh-end", mlsId: null } };
    const { rows: out, matched } = overlayOpenHouses(rows, catalog);
    expect(matched).toBe(1);
    expect(out[0]["NEXT OPEN HOUSE START TIME"]).toBe("fresh");
  });

  it("leaves rows with no catalog match unchanged (same object reference)", () => {
    const rows = [row("999 Nowhere Ave", "San Francisco", "keep", "keep-end")];
    const { rows: out, matched } = overlayOpenHouses(rows, {});
    expect(matched).toBe(0);
    expect(out[0]).toBe(rows[0]); // untouched reference
    expect(out[0]["NEXT OPEN HOUSE START TIME"]).toBe("keep");
  });

  it("coerces a null catalog end time to an empty string", () => {
    const rows = [row("1 A St", "SF", "x", "y")];
    const catalog = { "1 a st|sf": { start: "s", end: null, mlsId: null } };
    const { rows: out } = overlayOpenHouses(rows, catalog);
    expect(out[0]["NEXT OPEN HOUSE END TIME"]).toBe("");
  });

  it("only matches the rows present in the catalog (partial overlay)", () => {
    const rows = [row("1 A St", "SF", "a", ""), row("2 B St", "SF", "b", "")];
    const catalog = { "2 b st|sf": { start: "fresh-b", end: "", mlsId: null } };
    const { matched, rows: out } = overlayOpenHouses(rows, catalog);
    expect(matched).toBe(1);
    expect(out[0]["NEXT OPEN HOUSE START TIME"]).toBe("a"); // unchanged
    expect(out[1]["NEXT OPEN HOUSE START TIME"]).toBe("fresh-b");
  });
});
