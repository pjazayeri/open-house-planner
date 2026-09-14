import { describe, it, expect } from "vitest";
import { composeUniverse } from "./catalog";
import { addressKey } from "./addressKey";
import type { RawListing } from "../types";

const row = (address: string, over: Partial<RawListing> = {}): RawListing =>
  ({ ADDRESS: address, CITY: "San Francisco", STATUS: "Active", FAVORITE: "N", ...over }) as RawListing;
const k = (a: string) => addressKey(a, "San Francisco");

describe("composeUniverse", () => {
  it("appends catalog rows for hearted addresses not in the CSV, flagged as favorites", () => {
    const csv = [row("1 Main St", { FAVORITE: "Y" })];
    const catalog = { [k("2 Oak Ave")]: row("2 Oak Ave"), [k("1 Main St")]: row("1 Main St", { PRICE: "999" }) };
    const r = composeUniverse(csv, [k("2 Oak Ave"), k("1 Main St")], catalog);
    expect(r.rows.map((x) => x.ADDRESS)).toEqual(["1 Main St", "2 Oak Ave"]);
    expect(r.rows[1].FAVORITE).toBe("Y");
    expect(r.rows[0].PRICE).toBeUndefined(); // CSV row untouched here (merge is overlayCatalogRows' job)
    expect(r.added).toBe(1);
    expect(r.missing).toEqual([]);
  });

  it("reports hearted addresses with no catalog row yet", () => {
    const r = composeUniverse([], [k("3 Pine St")], {});
    expect(r.rows).toEqual([]);
    expect(r.missing).toEqual([k("3 Pine St")]);
  });

  it("works with no CSV at all (favorites-only universe)", () => {
    const r = composeUniverse([], [k("2 Oak Ave")], { [k("2 Oak Ave")]: row("2 Oak Ave") });
    expect(r.rows).toHaveLength(1);
    expect(r.added).toBe(1);
  });
});
