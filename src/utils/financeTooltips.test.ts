import { describe, it, expect } from "vitest";
import type { BuyVsRentResult } from "./mortgageCalc";
import { totalOwnCostTooltip, effectiveCostTooltip, netCostTooltip } from "./financeTooltips";

function fakeResult(over: Partial<BuyVsRentResult> = {}): BuyVsRentResult {
  return {
    downPayment: 200_000,
    loanAmount: 800_000,
    monthlyPI: 5_000,
    monthlyInterest: 4_000,
    monthlyPrincipal: 1_000,
    monthlyPropertyTax: 900,
    monthlyInsurance: 150,
    monthlyHOA: 0,
    monthlyMaintenance: 250,
    totalMonthlyOwnershipCost: 6_300,
    opportunityCostMonthly: 1_200,
    effectiveMonthlyOwnershipCost: 7_500,
    monthlyTaxSavings: 800,
    monthlyPropertyTaxSavings: 100,
    monthlyAppreciation: 2_500,
    netMonthlyOwnershipCost: 4_100,
    estimatedMonthlyRent: 4_200,
    monthlyBuyPremium: -100,
    cashOnCashReturnPct: 1.2,
    annualCashFlow: 5_000,
    totalCashInvested: 220_000,
    ...over,
  };
}

describe("totalOwnCostTooltip", () => {
  it("with principal included, shows P&I line and all components, ending with the total", () => {
    const t = totalOwnCostTooltip(fakeResult(), true);
    expect(t).toContain("P&I (interest + principal): $5,000 / mo");
    expect(t).toContain("Property tax:                $900 / mo");
    expect(t).toContain("Insurance:                   $150 / mo");
    expect(t).toContain("Maintenance:                 $250 / mo");
    expect(t).toContain("= $6,300 / mo");
    expect(t).not.toContain("HOA:"); // skipped when zero
  });

  it("with principal excluded, shows interest-only line and the excluded note", () => {
    const t = totalOwnCostTooltip(fakeResult(), false);
    expect(t).toContain("Interest only:               $4,000 / mo");
    expect(t).toContain("(Principal excluded — toggled off)");
    expect(t).not.toContain("P&I (interest + principal)");
  });

  it("includes HOA line only when monthlyHOA > 0", () => {
    const t = totalOwnCostTooltip(fakeResult({ monthlyHOA: 350 }), true);
    expect(t).toContain("HOA:                         $350 / mo");
  });
});

describe("effectiveCostTooltip", () => {
  it("shows total + opp cost summing to effective, with the opp return rate inline", () => {
    const t = effectiveCostTooltip(fakeResult(), 7);
    expect(t).toContain("Total own cost:              $6,300 / mo");
    expect(t).toContain("+ Opp. cost (7% return):    $1,200 / mo");
    expect(t).toContain("= $7,500 / mo");
  });
});

describe("netCostTooltip", () => {
  it("subtracts all three benefits when present and ends with the net", () => {
    const t = netCostTooltip(fakeResult());
    expect(t).toContain("Effective cost:              $7,500 / mo");
    expect(t).toContain("− Mortgage interest deduction: $800 / mo");
    expect(t).toContain("− Prop. tax SALT deduction:    $100 / mo");
    expect(t).toContain("− Appreciation:                $2,500 / mo");
    expect(t).toContain("= $4,100 / mo");
  });

  it("omits a deduction line when that figure is 0", () => {
    const t = netCostTooltip(fakeResult({
      monthlyTaxSavings: 0,
      monthlyPropertyTaxSavings: 0,
      monthlyAppreciation: 1_000,
      netMonthlyOwnershipCost: 6_500,
    }));
    expect(t).not.toContain("Mortgage interest deduction");
    expect(t).not.toContain("SALT deduction");
    expect(t).toContain("− Appreciation:                $1,000 / mo");
    expect(t).toContain("= $6,500 / mo");
  });
});
