import type { Listing } from "../types";

export interface MortgageParams {
  downPaymentPct: number;       // e.g. 0.20
  annualRatePct: number;        // e.g. 6.75
  termYears: number;            // 15 or 30
  opportunityReturnPct: number; // e.g. 7.0 — assumed annual return on down payment if invested
  includePrincipal: boolean;    // whether to count principal repayment as a "cost"
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
  estimatedMonthlyRent: number;
  monthlyBuyPremium: number;
}

export function calcBuyVsRent(listing: Listing, params: MortgageParams, rentOverride?: number): BuyVsRentResult {
  const { downPaymentPct, annualRatePct, termYears, opportunityReturnPct, includePrincipal } = params;
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
  const estimatedMonthlyRent = rentOverride ?? capRateBreakdown.monthlyRent;
  const monthlyBuyPremium = effectiveMonthlyOwnershipCost - estimatedMonthlyRent;

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
    estimatedMonthlyRent,
    monthlyBuyPremium,
  };
}
