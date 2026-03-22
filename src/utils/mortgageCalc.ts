import type { Listing } from "../types";

export interface MortgageParams {
  downPaymentPct: number;       // e.g. 0.20
  annualRatePct: number;        // e.g. 6.75
  termYears: number;            // 15 or 30
  opportunityReturnPct: number; // e.g. 7.0 — assumed annual return on down payment if invested
  includePrincipal: boolean;    // whether to count principal repayment as a "cost"
  marginalTaxRatePct: number;   // e.g. 28 — federal marginal rate for interest deduction
  appreciationRatePct: number;  // e.g. 3 — assumed annual property appreciation
  saltHeadroomAnnual: number;   // remaining SALT cap after state income tax (e.g. 10000)
}

export interface BuyVsRentResult {
  downPayment: number;
  loanAmount: number;
  monthlyPI: number;
  monthlyInterest: number;      // first-month interest component
  monthlyPrincipal: number;     // first-month principal component
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyHOA: number;
  monthlyMaintenance: number;
  totalMonthlyOwnershipCost: number;  // respects includePrincipal
  opportunityCostMonthly: number;
  effectiveMonthlyOwnershipCost: number;
  monthlyTaxSavings: number;        // mortgage interest deduction benefit
  monthlyPropertyTaxSavings: number; // SALT property tax deduction benefit (capped at saltHeadroomAnnual)
  monthlyAppreciation: number;       // equity gain from property appreciation
  netMonthlyOwnershipCost: number;   // effective − taxSavings − propTaxSavings − appreciation
  estimatedMonthlyRent: number;
  monthlyBuyPremium: number;    // net cost − rent
}

export interface TimeSeriesPoint {
  year: number;
  cumulativeBuyCashOut: number;  // total out-of-pocket for buying (excl. principal if toggled off, incl. opp cost, minus tax savings)
  saleProceeds: number;          // net sale proceeds if sold this year (after seller costs)
  netBuyCost: number;            // cumulativeBuyCashOut - saleProceeds (negative = you made money)
  cumulativeRentCost: number;    // cumulative rent paid (with inflation)
  homeValue: number;
  remainingBalance: number;
}

export interface TimeSeriesParams {
  holdYears: number;
  buyerClosingCostPct: number;  // upfront (% of price)
  sellerCostPct: number;        // paid at sale (% of sale price)
  rentInflationPct: number;     // annual rent growth %
}

export function calcTimeSeries(
  listing: Listing,
  params: MortgageParams,
  tsParams: TimeSeriesParams,
  rentOverride?: number,
): TimeSeriesPoint[] {
  const { downPaymentPct, annualRatePct, termYears, opportunityReturnPct, marginalTaxRatePct, appreciationRatePct, saltHeadroomAnnual } = params;
  const { holdYears, buyerClosingCostPct, sellerCostPct, rentInflationPct } = tsParams;
  const { price } = listing;

  const downPayment = price * downPaymentPct;
  const buyerClosing = price * (buyerClosingCostPct / 100);
  const loanAmount = price - downPayment;

  const r = annualRatePct / 12 / 100;
  const n = termYears * 12;
  let monthlyPI: number;
  if (r === 0) {
    monthlyPI = n > 0 ? loanAmount / n : 0;
  } else {
    const factor = Math.pow(1 + r, n);
    monthlyPI = loanAmount * (r * factor) / (factor - 1);
  }

  const monthlyPropertyTax = listing.capRateBreakdown.propertyTax / 12;
  const monthlyInsurance = listing.capRateBreakdown.insurance / 12;
  const monthlyHOA = listing.capRateBreakdown.annualHoa / 12;
  const monthlyMaintenance = listing.capRateBreakdown.maintenance / 12;
  const fixedMonthly = monthlyPropertyTax + monthlyInsurance + monthlyHOA + monthlyMaintenance;

  const oppCostMonthly = (downPayment * opportunityReturnPct) / 100 / 12;
  const baseMonthlyRent = rentOverride ?? listing.capRateBreakdown.monthlyRent;

  // Start: upfront costs = down payment + buyer closing costs + opportunity cost of down payment (already counted in oppCost stream)
  let cumulativeBuy = downPayment + buyerClosing;
  let balance = loanAmount;
  let cumulativeRent = 0;

  const points: TimeSeriesPoint[] = [];

  for (let month = 1; month <= holdYears * 12; month++) {
    // Interest for this month
    const interest = balance * r;
    const principal = monthlyPI - interest;
    balance = Math.max(0, balance - principal);

    // Monthly buy cash-out: always use full P&I regardless of includePrincipal toggle —
    // principal is real cash out and is recovered at sale via saleProceeds (homeValue - balance).
    // The toggle is a display preference for the monthly snapshot only.
    const piCost = monthlyPI;
    const taxSavings = interest * (marginalTaxRatePct / 100);
    const propTaxSavings = Math.min(listing.capRateBreakdown.propertyTax, saltHeadroomAnnual) * (marginalTaxRatePct / 100) / 12;
    cumulativeBuy += piCost + fixedMonthly + oppCostMonthly - taxSavings - propTaxSavings;

    // Monthly rent (with annual inflation — step up each January)
    const yearIndex = Math.floor((month - 1) / 12);
    const monthlyRent = baseMonthlyRent * Math.pow(1 + rentInflationPct / 100, yearIndex);
    cumulativeRent += monthlyRent;

    // Record at year boundaries
    if (month % 12 === 0) {
      const year = month / 12;
      const homeValue = price * Math.pow(1 + appreciationRatePct / 100, year);
      const saleProceeds = homeValue * (1 - sellerCostPct / 100) - balance;
      const netBuyCost = cumulativeBuy - Math.max(0, saleProceeds);

      points.push({ year, cumulativeBuyCashOut: cumulativeBuy, saleProceeds, netBuyCost, cumulativeRentCost: cumulativeRent, homeValue, remainingBalance: balance });
    }
  }

  return points;
}

export function calcBuyVsRent(listing: Listing, params: MortgageParams, rentOverride?: number): BuyVsRentResult {
  const { downPaymentPct, annualRatePct, termYears, opportunityReturnPct, includePrincipal, marginalTaxRatePct, appreciationRatePct, saltHeadroomAnnual } = params;
  const { price, capRateBreakdown } = listing;

  const downPayment = price * downPaymentPct;
  const loanAmount = price - downPayment;

  // P&I: L × r(1+r)^n / ((1+r)^n − 1)
  const r = annualRatePct / 12 / 100;
  const n = termYears * 12;
  let monthlyPI: number;
  if (r === 0) {
    monthlyPI = n > 0 ? loanAmount / n : 0;
  } else {
    const factor = Math.pow(1 + r, n);
    monthlyPI = loanAmount * (r * factor) / (factor - 1);
  }

  // First-month split: interest = balance × monthly rate; principal = remainder
  const monthlyInterest = loanAmount * r;
  const monthlyPrincipal = monthlyPI - monthlyInterest;

  const monthlyPropertyTax = capRateBreakdown.propertyTax / 12;
  const monthlyInsurance = capRateBreakdown.insurance / 12;
  const monthlyHOA = capRateBreakdown.annualHoa / 12;
  const monthlyMaintenance = capRateBreakdown.maintenance / 12;

  const piContribution = includePrincipal ? monthlyPI : monthlyInterest;
  const totalMonthlyOwnershipCost =
    piContribution + monthlyPropertyTax + monthlyInsurance + monthlyHOA + monthlyMaintenance;

  const opportunityCostMonthly = (downPayment * opportunityReturnPct) / 100 / 12;
  const effectiveMonthlyOwnershipCost = totalMonthlyOwnershipCost + opportunityCostMonthly;

  // Tax savings: mortgage interest is deductible if user itemizes
  const monthlyTaxSavings = monthlyInterest * (marginalTaxRatePct / 100);
  // SALT property tax savings: deductible up to remaining SALT headroom
  const deductiblePropertyTax = Math.min(capRateBreakdown.propertyTax, saltHeadroomAnnual);
  const monthlyPropertyTaxSavings = deductiblePropertyTax * (marginalTaxRatePct / 100) / 12;
  // Appreciation: annual price growth builds equity (reduces net cost)
  const monthlyAppreciation = (price * appreciationRatePct) / 100 / 12;
  const netMonthlyOwnershipCost = effectiveMonthlyOwnershipCost - monthlyTaxSavings - monthlyPropertyTaxSavings - monthlyAppreciation;

  const estimatedMonthlyRent = rentOverride ?? capRateBreakdown.monthlyRent;
  const monthlyBuyPremium = netMonthlyOwnershipCost - estimatedMonthlyRent;

  return {
    downPayment,
    loanAmount,
    monthlyPI,
    monthlyInterest,
    monthlyPrincipal,
    monthlyPropertyTax,
    monthlyInsurance,
    monthlyHOA,
    monthlyMaintenance,
    totalMonthlyOwnershipCost,
    opportunityCostMonthly,
    effectiveMonthlyOwnershipCost,
    monthlyTaxSavings,
    monthlyPropertyTaxSavings,
    monthlyAppreciation,
    netMonthlyOwnershipCost,
    estimatedMonthlyRent,
    monthlyBuyPremium,
  };
}
