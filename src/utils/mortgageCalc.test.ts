import { describe, it, expect } from "vitest";
import type { Listing } from "../types";
import { calcBuyVsRent, calcTimeSeries, type MortgageParams, type TimeSeriesParams } from "./mortgageCalc";

// Cap-rate breakdown is structurally complex and not material to mortgage
// math; only the fields actually read by calcBuyVsRent / calcTimeSeries
// matter, so we hand-stub them on the listing.
function listing(over: Partial<Listing> & {
  propertyTax?: number;
  insurance?: number;
  annualHoa?: number;
  maintenance?: number;
  monthlyRent?: number;
} = {}): Listing {
  const breakdown = {
    propertyTax: over.propertyTax ?? 12_000,
    insurance: over.insurance ?? 2_400,
    annualHoa: over.annualHoa ?? 0,
    maintenance: over.maintenance ?? 4_800,
    monthlyRent: over.monthlyRent ?? 5_000,
  } as Listing["capRateBreakdown"];
  return {
    id: "L1",
    address: "100 Main St",
    location: "",
    city: "San Francisco",
    state: "CA",
    zip: "94115",
    price: over.price ?? 1_000_000,
    beds: 3,
    baths: 2,
    sqft: 1_500,
    yearBuilt: 2010,
    daysOnMarket: 5,
    pricePerSqft: 667,
    hoa: null,
    propertyType: "Condo/Co-op",
    openHouseStart: new Date(0),
    openHouseEnd: new Date(0),
    url: "",
    lat: 37.79,
    lng: -122.43,
    capRate: 4,
    capRateBreakdown: breakdown,
    status: "Active",
    ...over,
  };
}

const PARAMS: MortgageParams = {
  downPaymentPct: 0.20,
  annualRatePct: 6.0,
  termYears: 30,
  opportunityReturnPct: 7.0,
  includePrincipal: true,
  marginalTaxRatePct: 32,
  appreciationRatePct: 3.0,
  saltHeadroomAnnual: 10_000,
  buyerClosingCostPct: 2.5,
};

describe("calcBuyVsRent", () => {
  it("computes down payment + loan amount from price and downPaymentPct", () => {
    const r = calcBuyVsRent(listing({ price: 1_000_000 }), { ...PARAMS, downPaymentPct: 0.25 });
    expect(r.downPayment).toBe(250_000);
    expect(r.loanAmount).toBe(750_000);
  });

  it("computes monthlyPI using the standard amortization formula", () => {
    const r = calcBuyVsRent(listing({ price: 1_000_000 }), { ...PARAMS, downPaymentPct: 0.20, annualRatePct: 6.0, termYears: 30 });
    // L=800k, r=0.005/mo, n=360 — verify against the closed-form formula.
    const expected = 800_000 * (0.005 * Math.pow(1.005, 360)) / (Math.pow(1.005, 360) - 1);
    expect(r.monthlyPI).toBeCloseTo(expected, 4);
  });

  it("first-month interest equals loan × monthly rate; principal is the remainder", () => {
    const r = calcBuyVsRent(listing({ price: 1_000_000 }), PARAMS);
    expect(r.monthlyInterest).toBeCloseTo(800_000 * (6.0 / 12 / 100), 4);
    expect(r.monthlyPrincipal).toBeCloseTo(r.monthlyPI - r.monthlyInterest, 4);
  });

  it("handles 0% interest (loan / months, no compounding)", () => {
    const r = calcBuyVsRent(listing({ price: 1_000_000 }), { ...PARAMS, annualRatePct: 0, termYears: 30 });
    expect(r.monthlyPI).toBeCloseTo(800_000 / 360, 4);
    expect(r.monthlyInterest).toBe(0);
  });

  it("includePrincipal toggle controls only the displayed monthly snapshot", () => {
    const withP = calcBuyVsRent(listing(), { ...PARAMS, includePrincipal: true });
    const withoutP = calcBuyVsRent(listing(), { ...PARAMS, includePrincipal: false });
    expect(withP.totalMonthlyOwnershipCost - withoutP.totalMonthlyOwnershipCost)
      .toBeCloseTo(withP.monthlyPrincipal, 2);
    // Same loan/PI either way — just a presentation toggle.
    expect(withP.monthlyPI).toBe(withoutP.monthlyPI);
  });

  it("opportunityCostMonthly is downPayment × oppReturnPct / 12", () => {
    const r = calcBuyVsRent(listing({ price: 1_000_000 }), { ...PARAMS, downPaymentPct: 0.20, opportunityReturnPct: 6 });
    // 200k × 6% / 12 = 1000
    expect(r.opportunityCostMonthly).toBeCloseTo(1000, 2);
  });

  it("monthlyTaxSavings is mortgage interest × marginal tax rate", () => {
    const r = calcBuyVsRent(listing(), { ...PARAMS, marginalTaxRatePct: 30 });
    expect(r.monthlyTaxSavings).toBeCloseTo(r.monthlyInterest * 0.30, 4);
  });

  it("propertyTaxSavings caps at the SALT headroom (not the full property tax)", () => {
    const big = calcBuyVsRent(listing({ propertyTax: 30_000 }), { ...PARAMS, saltHeadroomAnnual: 10_000, marginalTaxRatePct: 32 });
    // Capped: 10k × 32% / 12
    expect(big.monthlyPropertyTaxSavings).toBeCloseTo(10_000 * 0.32 / 12, 4);

    const small = calcBuyVsRent(listing({ propertyTax: 6_000 }), { ...PARAMS, saltHeadroomAnnual: 10_000, marginalTaxRatePct: 32 });
    // Below cap: full 6k deductible
    expect(small.monthlyPropertyTaxSavings).toBeCloseTo(6_000 * 0.32 / 12, 4);
  });

  it("monthlyAppreciation is price × appreciationRatePct / 12", () => {
    const r = calcBuyVsRent(listing({ price: 1_200_000 }), { ...PARAMS, appreciationRatePct: 3 });
    expect(r.monthlyAppreciation).toBeCloseTo(1_200_000 * 0.03 / 12, 2);
  });

  it("monthlyBuyPremium = netOwnershipCost − rent (positive means buying costs more)", () => {
    const r = calcBuyVsRent(listing({ monthlyRent: 5_000 }), PARAMS);
    expect(r.monthlyBuyPremium).toBeCloseTo(r.netMonthlyOwnershipCost - 5_000, 2);
  });

  it("rentOverride takes precedence over the listing's estimated rent", () => {
    const r = calcBuyVsRent(listing({ monthlyRent: 5_000 }), PARAMS, 7_500);
    expect(r.estimatedMonthlyRent).toBe(7_500);
  });

  it("cashOnCashReturn = (rent − P&I − all opex) × 12 / totalCashInvested × 100", () => {
    const r = calcBuyVsRent(listing({ monthlyRent: 5_000 }), { ...PARAMS, downPaymentPct: 0.20, buyerClosingCostPct: 2 });
    const expected = (5_000 - r.monthlyPI - r.monthlyPropertyTax - r.monthlyInsurance - r.monthlyHOA - r.monthlyMaintenance) * 12;
    expect(r.annualCashFlow).toBeCloseTo(expected, 2);
    expect(r.totalCashInvested).toBe(200_000 + 20_000); // down + 2% closing
    expect(r.cashOnCashReturnPct).toBeCloseTo((r.annualCashFlow / r.totalCashInvested) * 100, 2);
  });

  it("cashOnCashReturn falls back to 0 when no cash invested (e.g. 0% down)", () => {
    const r = calcBuyVsRent(listing(), { ...PARAMS, downPaymentPct: 0, buyerClosingCostPct: 0 });
    expect(r.totalCashInvested).toBe(0);
    expect(r.cashOnCashReturnPct).toBe(0);
  });
});

const TS_PARAMS: TimeSeriesParams = {
  holdYears: 10,
  buyerClosingCostPct: 2,
  sellerCostPct: 6,
  rentInflationPct: 3,
};

describe("calcTimeSeries", () => {
  it("returns one point per year up to holdYears", () => {
    const points = calcTimeSeries(listing(), PARAMS, { ...TS_PARAMS, holdYears: 7 });
    expect(points).toHaveLength(7);
    expect(points.map((p) => p.year)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("homeValue grows by appreciationRatePct per year", () => {
    const points = calcTimeSeries(listing({ price: 1_000_000 }), { ...PARAMS, appreciationRatePct: 4 }, TS_PARAMS);
    expect(points[0].homeValue).toBeCloseTo(1_000_000 * 1.04, 0);
    expect(points[9].homeValue).toBeCloseTo(1_000_000 * Math.pow(1.04, 10), 0);
  });

  it("saleProceeds = homeValue × (1 − sellerCostPct) − remainingBalance", () => {
    const points = calcTimeSeries(listing({ price: 1_000_000 }), PARAMS, { ...TS_PARAMS, sellerCostPct: 6 });
    const last = points[points.length - 1];
    expect(last.saleProceeds).toBeCloseTo(last.homeValue * 0.94 - last.remainingBalance, 0);
  });

  it("cumulativeRentCost compounds rent annually by rentInflationPct", () => {
    // rentInflation=0 → exactly 12 × baseRent each year, no compounding.
    const flat = calcTimeSeries(listing({ monthlyRent: 5_000 }), PARAMS, { ...TS_PARAMS, rentInflationPct: 0 });
    expect(flat[0].cumulativeRentCost).toBe(5_000 * 12);
    expect(flat[9].cumulativeRentCost).toBe(5_000 * 12 * 10);

    // rentInflation=3 → year 2 monthly = 5000 × 1.03, etc.
    const inflated = calcTimeSeries(listing({ monthlyRent: 5_000 }), PARAMS, { ...TS_PARAMS, rentInflationPct: 3 });
    let expected = 0;
    for (let y = 0; y < 10; y++) expected += 5_000 * Math.pow(1.03, y) * 12;
    expect(inflated[9].cumulativeRentCost).toBeCloseTo(expected, 0);
  });

  it("netBuyCost = cumulativeBuyCashOut − max(0, saleProceeds)", () => {
    const points = calcTimeSeries(listing(), PARAMS, TS_PARAMS);
    for (const p of points) {
      expect(p.netBuyCost).toBeCloseTo(p.cumulativeBuyCashOut - Math.max(0, p.saleProceeds), 0);
    }
  });

  it("loan balance strictly decreases each year", () => {
    const points = calcTimeSeries(listing(), PARAMS, TS_PARAMS);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].remainingBalance).toBeLessThan(points[i - 1].remainingBalance);
    }
  });

  it("upfront cash includes down payment + buyer closing — first-year cumulativeBuy reflects that", () => {
    // Make rates harsh so we can sanity-check the upfront baseline.
    const points = calcTimeSeries(
      listing({ price: 1_000_000 }),
      { ...PARAMS, downPaymentPct: 0.20 },
      { ...TS_PARAMS, buyerClosingCostPct: 2.5 }
    );
    // Year 1's cumulativeBuyCashOut should be at least down + closing
    // (200k + 25k = 225k) — could be more once 12 months of P&I, taxes,
    // insurance, opp cost are added.
    expect(points[0].cumulativeBuyCashOut).toBeGreaterThanOrEqual(225_000);
  });
});

// Mirrors the inline interpolation in FinancePage.tsx — kept here as a pure
// helper so the algorithm is testable. If FinancePage's logic ever diverges,
// align it back to this implementation.
function findBreakEven(
  points: Array<{ year: number; netBuyCost: number; cumulativeRentCost: number }>
): { year: number; value: number } | null {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dPrev = prev.netBuyCost - prev.cumulativeRentCost;
    const dCurr = curr.netBuyCost - curr.cumulativeRentCost;
    if (dPrev > 0 && dCurr <= 0) {
      const t = dPrev / (dPrev - dCurr);
      return {
        year: prev.year + (curr.year - prev.year) * t,
        value: prev.netBuyCost + (curr.netBuyCost - prev.netBuyCost) * t,
      };
    }
  }
  return null;
}

describe("findBreakEven (regression: dot must sit at the visual line intersection)", () => {
  it("interpolates a fractional year between the two surrounding samples", () => {
    // Buy crosses below rent halfway between yr3 and yr4: dPrev=+10, dCurr=-10 → t=0.5 → yr3.5
    const points = [
      { year: 1, netBuyCost: 100, cumulativeRentCost: 50 },
      { year: 2, netBuyCost: 150, cumulativeRentCost: 100 },
      { year: 3, netBuyCost: 200, cumulativeRentCost: 190 }, // dPrev=+10
      { year: 4, netBuyCost: 250, cumulativeRentCost: 260 }, // dCurr=-10
    ];
    const be = findBreakEven(points)!;
    expect(be.year).toBeCloseTo(3.5, 4);
    // Buy line at yr3.5: 200 + 0.5×(250−200) = 225
    expect(be.value).toBeCloseTo(225, 4);
  });

  it("returns null when buy never drops below rent", () => {
    const points = [
      { year: 1, netBuyCost: 100, cumulativeRentCost: 50 },
      { year: 2, netBuyCost: 200, cumulativeRentCost: 100 },
    ];
    expect(findBreakEven(points)).toBeNull();
  });

  it("returns null when rent never catches up to buy in reverse (never crossed from above)", () => {
    // Buy starts below rent and stays there — there's no "above to below" crossover.
    const points = [
      { year: 1, netBuyCost: 50, cumulativeRentCost: 100 },
      { year: 2, netBuyCost: 100, cumulativeRentCost: 200 },
    ];
    expect(findBreakEven(points)).toBeNull();
  });

  it("at exact equality (dCurr === 0) lands the dot on the second sample", () => {
    const points = [
      { year: 1, netBuyCost: 100, cumulativeRentCost: 50 },
      { year: 2, netBuyCost: 200, cumulativeRentCost: 200 }, // dCurr = 0
    ];
    const be = findBreakEven(points)!;
    expect(be.year).toBeCloseTo(2, 4);
    expect(be.value).toBeCloseTo(200, 4);
  });
});
