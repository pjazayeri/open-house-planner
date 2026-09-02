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
  const monthlyRent = over.monthlyRent ?? 5_000;
  const breakdown = {
    propertyTax: over.propertyTax ?? 12_000,
    insurance: over.insurance ?? 2_400,
    annualHoa: over.annualHoa ?? 0,
    maintenance: over.maintenance ?? 4_800,
    monthlyRent,
    annualGrossRent: monthlyRent * 12,
    vacancy: monthlyRent * 12 * 0.05,
    management: 0,
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

  it("opportunityCostMonthly is (downPayment + buyer closing) × oppReturnPct / 12", () => {
    const r = calcBuyVsRent(listing({ price: 1_000_000 }), { ...PARAMS, downPaymentPct: 0.2, buyerClosingCostPct: 2.5, opportunityReturnPct: 6 });
    // (200k + 25k) × 6% / 12
    expect(r.opportunityCostMonthly).toBeCloseTo(225_000 * 0.06 / 12, 6);
  });

  it("monthlyTaxSavings is deductible mortgage interest × marginal tax rate", () => {
    // 900k × 80% = 720k loan — under the $750k cap, so all interest counts.
    const r = calcBuyVsRent(listing({ price: 900_000 }), { ...PARAMS, downPaymentPct: 0.2, marginalTaxRatePct: 32 });
    expect(r.monthlyTaxSavings).toBeCloseTo(r.monthlyInterest * 0.32, 4);
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

  it("cashOnCashReturn = (rent − vacancy − mgmt − (P&I + all opex) × 12) / totalCashInvested × 100", () => {
    const r = calcBuyVsRent(listing({ price: 1_000_000, monthlyRent: 5_000 }), { ...PARAMS, downPaymentPct: 0.2, buyerClosingCostPct: 2.5 });
    const annualRent = 60_000;
    expect(r.annualVacancy).toBeCloseTo(annualRent * 0.05, 6);
    expect(r.annualManagement).toBe(0);
    const opex = (r.monthlyPI + 1_000 + 200 + 0 + 400) * 12;
    const expectedCashFlow = annualRent - 3_000 - opex;
    expect(r.annualCashFlow).toBeCloseTo(expectedCashFlow, 4);
    expect(r.totalCashInvested).toBeCloseTo(225_000, 6);
    expect(r.cashOnCashReturnPct).toBeCloseTo(expectedCashFlow / 225_000 * 100, 6);
  });

  it("mortgage interest deduction only covers the first $750k of loan", () => {
    // 2M × 80% = 1.6M loan → 750k / 1.6M = 46.875% of interest is deductible
    const r = calcBuyVsRent(listing({ price: 2_000_000 }), { ...PARAMS, downPaymentPct: 0.2, marginalTaxRatePct: 32 });
    expect(r.deductibleInterestFraction).toBeCloseTo(0.46875, 6);
    expect(r.monthlyTaxSavings).toBeCloseTo(r.monthlyInterest * 0.46875 * 0.32, 4);

    // Under the cap → everything is deductible
    const small = calcBuyVsRent(listing({ price: 900_000 }), { ...PARAMS, downPaymentPct: 0.2, marginalTaxRatePct: 32 });
    expect(small.deductibleInterestFraction).toBe(1);
    expect(small.monthlyTaxSavings).toBeCloseTo(small.monthlyInterest * 0.32, 4);
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

// Look a series point up by calendar year (the series starts at year 0).
function at(points: ReturnType<typeof calcTimeSeries>, year: number) {
  const p = points.find((p) => p.year === year);
  if (!p) throw new Error(`no point for year ${year}`);
  return p;
}

describe("calcTimeSeries", () => {
  it("returns a year-0 (closing) point plus one point per year up to holdYears", () => {
    const points = calcTimeSeries(listing(), PARAMS, { ...TS_PARAMS, holdYears: 7 });
    expect(points).toHaveLength(8);
    expect(points.map((p) => p.year)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("year 0 is the day of closing: cash out = down + closing, net cost = round-trip transaction costs", () => {
    const points = calcTimeSeries(
      listing({ price: 1_000_000 }),
      { ...PARAMS, downPaymentPct: 0.20 },
      { ...TS_PARAMS, buyerClosingCostPct: 2.5, sellerCostPct: 6 }
    );
    const p0 = at(points, 0);
    expect(p0.cumulativeBuyCashOut).toBeCloseTo(225_000, 0);   // 200k down + 25k closing
    expect(p0.homeValue).toBe(1_000_000);
    expect(p0.remainingBalance).toBeCloseTo(800_000, 0);
    expect(p0.cumulativeRentCost).toBe(0);
    // Sell on the spot: 1M × 0.94 − 800k = 140k back → net cost 225k − 140k = 85k
    // = 25k buyer closing + 60k seller costs.
    expect(p0.netBuyCost).toBeCloseTo(85_000, 0);
  });

  it("homeValue grows by appreciationRatePct per year", () => {
    const points = calcTimeSeries(listing({ price: 1_000_000 }), { ...PARAMS, appreciationRatePct: 4 }, TS_PARAMS);
    expect(at(points, 1).homeValue).toBeCloseTo(1_000_000 * 1.04, 0);
    expect(at(points, 10).homeValue).toBeCloseTo(1_000_000 * Math.pow(1.04, 10), 0);
  });

  it("saleProceeds = homeValue × (1 − sellerCostPct) − remainingBalance", () => {
    const points = calcTimeSeries(listing({ price: 1_000_000 }), PARAMS, { ...TS_PARAMS, sellerCostPct: 6 });
    const last = points[points.length - 1];
    expect(last.saleProceeds).toBeCloseTo(last.homeValue * 0.94 - last.remainingBalance, 0);
  });

  it("cumulativeRentCost compounds rent annually by rentInflationPct", () => {
    // rentInflation=0 → exactly 12 × baseRent each year, no compounding.
    const flat = calcTimeSeries(listing({ monthlyRent: 5_000 }), PARAMS, { ...TS_PARAMS, rentInflationPct: 0 });
    expect(at(flat, 1).cumulativeRentCost).toBe(5_000 * 12);
    expect(at(flat, 10).cumulativeRentCost).toBe(5_000 * 12 * 10);

    // rentInflation=3 → year 2 monthly = 5000 × 1.03, etc.
    const inflated = calcTimeSeries(listing({ monthlyRent: 5_000 }), PARAMS, { ...TS_PARAMS, rentInflationPct: 3 });
    let expected = 0;
    for (let y = 0; y < 10; y++) expected += 5_000 * Math.pow(1.03, y) * 12;
    expect(at(inflated, 10).cumulativeRentCost).toBeCloseTo(expected, 0);
  });

  it("netBuyCost = cumulativeBuyCashOut − saleProceeds (no clamp: an underwater sale is a cost)", () => {
    const points = calcTimeSeries(listing(), PARAMS, TS_PARAMS);
    for (const p of points) {
      expect(p.netBuyCost).toBeCloseTo(p.cumulativeBuyCashOut - p.saleProceeds, 0);
    }
    // 5% down + 6% seller costs → underwater at closing: proceeds = 0.94M − 0.95M = −10k,
    // so the day-0 net cost is down + closing + the 10k shortfall.
    const thin = calcTimeSeries(listing({ price: 1_000_000 }), { ...PARAMS, downPaymentPct: 0.05 }, { ...TS_PARAMS, buyerClosingCostPct: 2, sellerCostPct: 6 });
    expect(thin[0].saleProceeds).toBeCloseTo(-10_000, 0);
    expect(thin[0].netBuyCost).toBeCloseTo(50_000 + 20_000 + 10_000, 0);
  });

  it("loan balance strictly decreases each year", () => {
    const points = calcTimeSeries(listing(), PARAMS, TS_PARAMS);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].remainingBalance).toBeLessThan(points[i - 1].remainingBalance);
    }
  });

  it("upfront cash includes down payment + buyer closing — first-year cumulativeBuy reflects that", () => {
    const points = calcTimeSeries(
      listing({ price: 1_000_000 }),
      { ...PARAMS, downPaymentPct: 0.20 },
      { ...TS_PARAMS, buyerClosingCostPct: 2.5 }
    );
    // Year 1's cumulativeBuyCashOut is down + closing (200k + 25k = 225k)
    // plus 12 months of P&I, taxes, insurance, opp cost.
    expect(at(points, 1).cumulativeBuyCashOut).toBeGreaterThan(225_000);
  });

  // Regression: with a 15-yr loan and a 20-yr hold the old loop kept adding
  // the full P&I payment for years 16–20 even though the balance was 0 —
  // ~$200k of phantom cost on a ~$400k loan.
  it("stops charging P&I once the loan is paid off (hold > term)", () => {
    // Zero out property tax + opportunity cost so the post-payoff years are
    // just flat insurance + maintenance and the arithmetic is exact.
    const points = calcTimeSeries(
      listing({ price: 900_000, propertyTax: 0 }),
      { ...PARAMS, termYears: 15, downPaymentPct: 0.20, opportunityReturnPct: 0 },
      { ...TS_PARAMS, holdYears: 20, rentInflationPct: 0 }
    );
    expect(at(points, 15).remainingBalance).toBeCloseTo(0, 0);
    expect(at(points, 20).remainingBalance).toBe(0);

    // After payoff the only yearly cash out is insurance + maintenance.
    const yearlyPostPayoff = 2_400 + 4_800;
    expect(at(points, 16).cumulativeBuyCashOut - at(points, 15).cumulativeBuyCashOut).toBeCloseTo(yearlyPostPayoff, 0);
    expect(at(points, 20).cumulativeBuyCashOut - at(points, 16).cumulativeBuyCashOut).toBeCloseTo(4 * yearlyPostPayoff, 0);

    // …and the total P&I over the whole hold is exactly 180 payments.
    const loan = 720_000;
    const r = 6 / 12 / 100, n = 180, f = Math.pow(1 + r, n);
    const monthlyPI = loan * (r * f) / (f - 1);
    const totalInterest = monthlyPI * n - loan;
    const expectedCashOut = 180_000 + 18_000 /* down + 2% closing */
      + monthlyPI * n
      + 20 * yearlyPostPayoff
      - totalInterest * 0.32;
    expect(at(points, 20).cumulativeBuyCashOut).toBeCloseTo(expectedCashOut, 0);
  });

  it("caps the final payment at the remaining balance (never pays past zero)", () => {
    const points = calcTimeSeries(listing(), { ...PARAMS, termYears: 15 }, { ...TS_PARAMS, holdYears: 16 });
    expect(at(points, 15).remainingBalance).toBeCloseTo(0, 0);
    expect(at(points, 16).remainingBalance).toBe(0);
    // Balance never goes negative and only ever decreases.
    for (let i = 1; i < points.length; i++) {
      expect(points[i].remainingBalance).toBeGreaterThanOrEqual(0);
      expect(points[i].remainingBalance).toBeLessThanOrEqual(points[i - 1].remainingBalance);
    }
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

describe("calcTimeSeries accuracy: compounding, inflation, deduction cap", () => {
  // Flat everything except the thing under test.
  const FLAT: MortgageParams = { ...PARAMS, annualRatePct: 0, opportunityReturnPct: 0, marginalTaxRatePct: 0, appreciationRatePct: 0 };
  const FLAT_TS: TimeSeriesParams = { ...TS_PARAMS, rentInflationPct: 0, costInflationPct: 0 };

  it("opportunity cost compounds on down + closing at opportunityReturnPct", () => {
    const points = calcTimeSeries(
      listing({ price: 1_000_000, propertyTax: 0, insurance: 0, maintenance: 0 }),
      { ...FLAT, downPaymentPct: 0.2, opportunityReturnPct: 7 },
      { ...FLAT_TS, buyerClosingCostPct: 2.5, holdYears: 10 }
    );
    const sunk = 225_000;
    const pi = 800_000 / 360; // 0% loan
    for (const y of [1, 5, 10]) {
      const expectedOpp = sunk * (Math.pow(1.07, y) - 1);
      expect(at(points, y).cumulativeBuyCashOut - sunk - pi * 12 * y).toBeCloseTo(expectedOpp, 0);
    }
    // Simple interest would have given 7% × 225k × 10 = 157.5k; compounding is materially more.
    expect(at(points, 10).cumulativeBuyCashOut - sunk - pi * 120).toBeGreaterThan(157_500 + 60_000);
  });

  it("property tax grows 2%/yr (Prop 13) while other costs follow costInflationPct", () => {
    const points = calcTimeSeries(
      listing({ price: 1_000_000, propertyTax: 12_000, insurance: 2_400, maintenance: 4_800, annualHoa: 1_200 }),
      { ...FLAT, downPaymentPct: 1 },   // no loan → no P&I
      { ...FLAT_TS, buyerClosingCostPct: 0, costInflationPct: 3, holdYears: 3 }
    );
    const yearCost = (y: number) => at(points, y).cumulativeBuyCashOut - at(points, y - 1).cumulativeBuyCashOut;
    expect(yearCost(1)).toBeCloseTo(12_000 + 8_400, 0);
    expect(yearCost(2)).toBeCloseTo(12_000 * 1.02 + 8_400 * 1.03, 0);
    expect(yearCost(3)).toBeCloseTo(12_000 * 1.02 ** 2 + 8_400 * 1.03 ** 2, 0);
  });

  it("costInflationPct defaults to rentInflationPct", () => {
    const explicit = calcTimeSeries(listing(), FLAT, { ...FLAT_TS, rentInflationPct: 3, costInflationPct: 3 });
    const implicit = calcTimeSeries(listing(), FLAT, { ...FLAT_TS, rentInflationPct: 3, costInflationPct: undefined });
    expect(at(implicit, 10).cumulativeBuyCashOut).toBeCloseTo(at(explicit, 10).cumulativeBuyCashOut, 6);
  });

  it("interest tax savings only count the first $750k of balance each month", () => {
    // 2M, 20% down → 1.6M loan; compare against a hand-rolled month loop.
    const params: MortgageParams = { ...PARAMS, downPaymentPct: 0.2, opportunityReturnPct: 0, marginalTaxRatePct: 32 };
    const points = calcTimeSeries(listing({ price: 2_000_000, propertyTax: 0, insurance: 0, maintenance: 0 }), params, { ...FLAT_TS, buyerClosingCostPct: 0, holdYears: 1 });
    const r = 0.06 / 12, n = 360, f = Math.pow(1 + r, n);
    const pi = 1_600_000 * (r * f) / (f - 1);
    let bal = 1_600_000, expected = 400_000;
    for (let m = 0; m < 12; m++) {
      const interest = bal * r;
      const frac = bal > 750_000 ? 750_000 / bal : 1;
      expected += pi - interest * frac * 0.32;
      bal -= pi - interest;
    }
    expect(at(points, 1).cumulativeBuyCashOut).toBeCloseTo(expected, 0);
  });
});
