import type { Listing } from "../types";

export interface MortgageParams {
  downPaymentPct: number;       // e.g. 0.20
  annualRatePct: number;        // e.g. 6.75
  termYears: number;            // 15 or 30
  opportunityReturnPct: number; // e.g. 7.0 — assumed annual return on down payment if invested
}

export interface BuyVsRentResult {
  downPayment: number;
  loanAmount: number;
  monthlyPI: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
  monthlyHOA: number;
  monthlyMaintenance: number;
  totalMonthlyOwnershipCost: number;
  opportunityCostMonthly: number;
  effectiveMonthlyOwnershipCost: number;
  estimatedMonthlyRent: number;
  monthlyBuyPremium: number;
}

export function calcBuyVsRent(listing: Listing, params: MortgageParams): BuyVsRentResult {
  const { downPaymentPct, annualRatePct, termYears, opportunityReturnPct } = params;
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

  const monthlyPropertyTax = capRateBreakdown.propertyTax / 12;
  const monthlyInsurance = capRateBreakdown.insurance / 12;
  const monthlyHOA = capRateBreakdown.annualHoa / 12;
  const monthlyMaintenance = capRateBreakdown.maintenance / 12;

  const totalMonthlyOwnershipCost =
    monthlyPI + monthlyPropertyTax + monthlyInsurance + monthlyHOA + monthlyMaintenance;

  // Opportunity cost: foregone annual return on the down payment if it were invested instead
  const opportunityCostMonthly = (downPayment * opportunityReturnPct) / 100 / 12;

  const effectiveMonthlyOwnershipCost = totalMonthlyOwnershipCost + opportunityCostMonthly;
  const estimatedMonthlyRent = capRateBreakdown.monthlyRent;
  const monthlyBuyPremium = effectiveMonthlyOwnershipCost - estimatedMonthlyRent;

  return {
    downPayment,
    loanAmount,
    monthlyPI,
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
