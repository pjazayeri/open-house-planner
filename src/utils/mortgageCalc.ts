import type { Listing } from "../types";

/** Mortgage interest is deductible only on the first $750k of acquisition debt (TCJA, made permanent by OBBBA). */
export const MORTGAGE_INTEREST_DEDUCTION_CAP = 750_000;
/** CA Prop 13: assessed value — and so property tax — grows at most 2%/yr after purchase. */
export const PROP13_ASSESSMENT_GROWTH_PCT = 2;

export interface MortgageParams {
  downPaymentPct: number;       // e.g. 0.20
  annualRatePct: number;        // e.g. 6.75
  termYears: number;            // 15 or 30
  opportunityReturnPct: number; // e.g. 7.0 — assumed annual return on down payment if invested
  includePrincipal: boolean;    // whether to count principal repayment as a "cost"
  marginalTaxRatePct: number;   // e.g. 28 — federal marginal rate for interest deduction
  appreciationRatePct: number;  // e.g. 3 — assumed annual property appreciation
  saltHeadroomAnnual: number;   // remaining SALT cap after state income tax (e.g. 10000)
  buyerClosingCostPct: number;  // e.g. 2.5 — upfront closing costs as % of price
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
  monthlyTaxSavings: number;        // mortgage interest deduction benefit (interest under the $750k cap only)
  deductibleInterestFraction: number; // share of interest under MORTGAGE_INTEREST_DEDUCTION_CAP (1 = all of it)
  monthlyPropertyTaxSavings: number; // SALT property tax deduction benefit (capped at saltHeadroomAnnual)
  monthlyAppreciation: number;       // equity gain from property appreciation
  netMonthlyOwnershipCost: number;   // effective − taxSavings − propTaxSavings − appreciation
  estimatedMonthlyRent: number;
  monthlyBuyPremium: number;    // net cost − rent
  cashOnCashReturnPct: number;  // annual pre-tax cash flow / total cash invested × 100
  annualCashFlow: number;       // rent − vacancy − management − (P&I + all opex) × 12
  annualVacancy: number;        // vacancy allowance at the cap-rate model's rate (5%)
  annualManagement: number;     // property management (5+ unit multi-family only)
  totalCashInvested: number;    // down payment + buyer closing costs
}

export interface TimeSeriesPoint {
  year: number;                  // 0 = day of closing, then one point per year
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
  costInflationPct?: number;    // annual growth of insurance/HOA/maintenance (defaults to rentInflationPct)
}

export function calcTimeSeries(
  listing: Listing,
  params: MortgageParams,
  tsParams: TimeSeriesParams,
  rentOverride?: number,
): TimeSeriesPoint[] {
  const { downPaymentPct, annualRatePct, termYears, opportunityReturnPct, marginalTaxRatePct, appreciationRatePct, saltHeadroomAnnual } = params;
  const { holdYears, buyerClosingCostPct, sellerCostPct, rentInflationPct } = tsParams;
  const costInflationPct = tsParams.costInflationPct ?? rentInflationPct;
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

  // Year-1 ownership costs. Property tax drifts up under Prop 13; insurance,
  // HOA and maintenance drift with general inflation.
  const propertyTaxYear1 = listing.capRateBreakdown.propertyTax;
  const otherMonthlyYear1 = (listing.capRateBreakdown.insurance + listing.capRateBreakdown.annualHoa + listing.capRateBreakdown.maintenance) / 12;

  // Opportunity cost: the cash sunk at closing (down + closing) would
  // otherwise stay invested and compound at opportunityReturnPct.
  const oppMonthlyFactor = Math.pow(1 + opportunityReturnPct / 100, 1 / 12);
  let altInvested = downPayment + buyerClosing;

  const baseMonthlyRent = rentOverride ?? listing.capRateBreakdown.monthlyRent;

  let cumulativeBuy = downPayment + buyerClosing;
  let balance = loanAmount;
  let cumulativeRent = 0;

  // Year 0 = the day you close. You've paid down + closing; selling on the
  // spot would net price − seller costs − loan, so the net cost at t=0 is
  // exactly the round-trip transaction cost (buyer closing + seller costs).
  // Anchoring the series here makes that upfront hit visible on the chart.
  const saleProceedsAtClose = price * (1 - sellerCostPct / 100) - balance;
  const points: TimeSeriesPoint[] = [{
    year: 0,
    cumulativeBuyCashOut: cumulativeBuy,
    saleProceeds: saleProceedsAtClose,
    netBuyCost: cumulativeBuy - saleProceedsAtClose,
    cumulativeRentCost: 0,
    homeValue: price,
    remainingBalance: balance,
  }];

  for (let month = 1; month <= holdYears * 12; month++) {
    const yearIndex = Math.floor((month - 1) / 12);

    // Interest for this month. The final payment is capped at what's still
    // owed, and once the loan is paid off (hold > term) there's no P&I at all.
    const interest = balance * r;
    const deductibleFraction = balance > MORTGAGE_INTEREST_DEDUCTION_CAP ? MORTGAGE_INTEREST_DEDUCTION_CAP / balance : 1;
    const principal = Math.min(monthlyPI - interest, balance);
    const piCost = balance > 0 ? interest + principal : 0;
    balance = Math.max(0, balance - principal);

    const propertyTaxMonthly = propertyTaxYear1 * Math.pow(1 + PROP13_ASSESSMENT_GROWTH_PCT / 100, yearIndex) / 12;
    const otherMonthly = otherMonthlyYear1 * Math.pow(1 + costInflationPct / 100, yearIndex);
    const oppCost = altInvested * (oppMonthlyFactor - 1);
    altInvested *= oppMonthlyFactor;

    // Monthly buy cash-out: always use full P&I regardless of includePrincipal toggle —
    // principal is real cash out and is recovered at sale via saleProceeds (homeValue - balance).
    // The toggle is a display preference for the monthly snapshot only.
    const taxSavings = interest * deductibleFraction * (marginalTaxRatePct / 100);
    const propTaxSavings = Math.min(propertyTaxMonthly * 12, saltHeadroomAnnual) * (marginalTaxRatePct / 100) / 12;
    cumulativeBuy += piCost + propertyTaxMonthly + otherMonthly + oppCost - taxSavings - propTaxSavings;

    // Monthly rent (with annual inflation — step up each January)
    const monthlyRent = baseMonthlyRent * Math.pow(1 + rentInflationPct / 100, yearIndex);
    cumulativeRent += monthlyRent;

    // Record at year boundaries
    if (month % 12 === 0) {
      const year = month / 12;
      const homeValue = price * Math.pow(1 + appreciationRatePct / 100, year);
      const saleProceeds = homeValue * (1 - sellerCostPct / 100) - balance;
      // Negative proceeds (underwater) mean bringing cash to the closing
      // table — a real cost, so it is not clamped to zero.
      const netBuyCost = cumulativeBuy - saleProceeds;

      points.push({ year, cumulativeBuyCashOut: cumulativeBuy, saleProceeds, netBuyCost, cumulativeRentCost: cumulativeRent, homeValue, remainingBalance: balance });
    }
  }

  return points;
}

export function calcBuyVsRent(listing: Listing, params: MortgageParams, rentOverride?: number): BuyVsRentResult {
  const { downPaymentPct, annualRatePct, termYears, opportunityReturnPct, includePrincipal, marginalTaxRatePct, appreciationRatePct, saltHeadroomAnnual, buyerClosingCostPct } = params;
  const { price, capRateBreakdown } = listing;

  const downPayment = price * downPaymentPct;
  const loanAmount = price - downPayment;
  const buyerClosing = price * (buyerClosingCostPct / 100);
  const totalCashInvested = downPayment + buyerClosing;

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

  // Opportunity cost of the cash sunk at closing (down + closing costs),
  // first-year simple rate. calcTimeSeries compounds it over the hold.
  const opportunityCostMonthly = (totalCashInvested * opportunityReturnPct) / 100 / 12;
  const effectiveMonthlyOwnershipCost = totalMonthlyOwnershipCost + opportunityCostMonthly;

  // Tax savings: mortgage interest is deductible if user itemizes — but only
  // on the first $750k of the loan.
  const deductibleInterestFraction = loanAmount > MORTGAGE_INTEREST_DEDUCTION_CAP ? MORTGAGE_INTEREST_DEDUCTION_CAP / loanAmount : 1;
  const monthlyTaxSavings = monthlyInterest * deductibleInterestFraction * (marginalTaxRatePct / 100);
  // SALT property tax savings: deductible up to remaining SALT headroom
  const deductiblePropertyTax = Math.min(capRateBreakdown.propertyTax, saltHeadroomAnnual);
  const monthlyPropertyTaxSavings = deductiblePropertyTax * (marginalTaxRatePct / 100) / 12;
  // Appreciation: annual price growth builds equity (reduces net cost)
  const monthlyAppreciation = (price * appreciationRatePct) / 100 / 12;
  const netMonthlyOwnershipCost = effectiveMonthlyOwnershipCost - monthlyTaxSavings - monthlyPropertyTaxSavings - monthlyAppreciation;

  const estimatedMonthlyRent = rentOverride ?? capRateBreakdown.monthlyRent;
  const monthlyBuyPremium = netMonthlyOwnershipCost - estimatedMonthlyRent;

  // Cash-on-cash return: annual pre-tax cash flow / total cash invested.
  // Cash flow = rent − vacancy − management − P&I − all operating expenses
  // (ignores appreciation & tax savings — pure cash). Vacancy/management use
  // the cap-rate model's rates so CoC and cap rate agree on what "rent" nets.
  const agr = capRateBreakdown.annualGrossRent;
  const vacancyRate = agr > 0 ? capRateBreakdown.vacancy / agr : 0.05;
  const managementRate = agr > 0 ? capRateBreakdown.management / agr : 0;
  const annualRent = estimatedMonthlyRent * 12;
  const annualVacancy = annualRent * vacancyRate;
  const annualManagement = annualRent * managementRate;
  const annualCashFlow = annualRent - annualVacancy - annualManagement
    - (monthlyPI + monthlyPropertyTax + monthlyInsurance + monthlyHOA + monthlyMaintenance) * 12;
  const cashOnCashReturnPct = totalCashInvested > 0 ? (annualCashFlow / totalCashInvested) * 100 : 0;

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
    deductibleInterestFraction,
    monthlyPropertyTaxSavings,
    monthlyAppreciation,
    netMonthlyOwnershipCost,
    estimatedMonthlyRent,
    monthlyBuyPremium,
    cashOnCashReturnPct,
    annualCashFlow,
    annualVacancy,
    annualManagement,
    totalCashInvested,
  };
}
