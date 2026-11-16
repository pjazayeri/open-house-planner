import { describe, it, expect } from "vitest";
import { buildFinanceShare, mortgageParamsFrom, parseFinanceShare } from "./financeShare";
import { makeListing, INPUTS } from "./financeShare.fixtures";

/** What the snapshot looks like after a trip through /api/share + /api/plan. */
const roundTrip = (x: unknown) => JSON.parse(JSON.stringify(x));

describe("mortgageParamsFrom", () => {
  it("converts page inputs to calc params", () => {
    expect(mortgageParamsFrom(INPUTS)).toEqual({
      downPaymentPct: 1,
      annualRatePct: 7.11,
      termYears: 30,
      opportunityReturnPct: 4,
      includePrincipal: true,
      marginalTaxRatePct: 32,
      appreciationRatePct: 3,
      saltHeadroomAnnual: 10_000,
      buyerClosingCostPct: 0.25,
    });
  });

  it("zeroes appreciation when the toggle is off", () => {
    expect(mortgageParamsFrom({ ...INPUTS, includeAppreciation: false }).appreciationRatePct).toBe(0);
  });
});

describe("buildFinanceShare / parseFinanceShare", () => {
  it("round-trips through JSON with dates revived", () => {
    const est = { rent: 6980, low: 5880, high: 8080, comparables: 15, fetchedAt: "2026-11-15T00:00:00.000Z" };
    const snap = buildFinanceShare(makeListing(), INPUTS, 6980, est, new Date("2026-11-16T12:00:00Z"));
    const parsed = parseFinanceShare(roundTrip(snap));
    expect(parsed).not.toBeNull();
    expect(parsed!.inputs).toEqual(INPUTS);
    expect(parsed!.rentOverride).toBe(6980);
    expect(parsed!.rentEstimate).toEqual(est);
    expect(parsed!.sharedAt).toBe("2026-11-16T12:00:00.000Z");
    expect(parsed!.listing.address).toBe("1835 Franklin St #802");
    expect(parsed!.listing.capRateBreakdown).toEqual(makeListing().capRateBreakdown);
    expect(parsed!.listing.openHouseStart).toBeInstanceOf(Date);
    expect(parsed!.listing.openHouseStart.getTime()).toBe(makeListing().openHouseStart.getTime());
  });

  it("drops per-user tour fields from the listing", () => {
    const snap = buildFinanceShare(makeListing({ visitOrder: 3, timeSlot: "Sat 1–3" }), INPUTS, null, null);
    expect(snap.listing).not.toHaveProperty("visitOrder");
    expect(snap.listing).not.toHaveProperty("timeSlot");
  });

  it("keeps a null rent override / estimate as null", () => {
    const parsed = parseFinanceShare(roundTrip(buildFinanceShare(makeListing(), INPUTS, null, null)));
    expect(parsed!.rentOverride).toBeNull();
    expect(parsed!.rentEstimate).toBeNull();
  });

  it("rejects payloads that aren't a finance snapshot", () => {
    const good = roundTrip(buildFinanceShare(makeListing(), INPUTS, null, null));
    expect(parseFinanceShare(null)).toBeNull();
    expect(parseFinanceShare({ groups: [] })).toBeNull(); // a shared tour plan
    expect(parseFinanceShare({ ...good, v: 2 })).toBeNull();
    expect(parseFinanceShare({ ...good, listing: { ...good.listing, price: 0 } })).toBeNull();
    expect(parseFinanceShare({ ...good, listing: { ...good.listing, capRateBreakdown: undefined } })).toBeNull();
    expect(parseFinanceShare({ ...good, inputs: { ...good.inputs, ratePct: "7" } })).toBeNull();
    expect(parseFinanceShare({ ...good, inputs: { ...good.inputs, termYears: 20 } })).toBeNull();
  });
});
