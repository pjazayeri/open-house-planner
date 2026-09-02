import type { BuyVsRentResult } from "./mortgageCalc";

const fmtMo = (n: number): string => "$" + Math.round(n).toLocaleString("en-US") + " / mo";

/**
 * Builds the hover-tooltip text for the "Total own cost" derived figure on
 * the Finance page. Itemizes the components that sum to it so users can see
 * exactly what makes up the number.
 */
export function totalOwnCostTooltip(result: BuyVsRentResult, includePrincipal: boolean): string {
  const lines: string[] = [
    `Sum of your monthly out-of-pocket housing costs.`,
    ``,
  ];
  if (includePrincipal) {
    lines.push(`  P&I (interest + principal): ${fmtMo(result.monthlyPI)}`);
  } else {
    lines.push(`  Interest only:               ${fmtMo(result.monthlyInterest)}`);
    lines.push(`  (Principal excluded — toggled off)`);
  }
  lines.push(`  Property tax:                ${fmtMo(result.monthlyPropertyTax)}`);
  lines.push(`  Insurance:                   ${fmtMo(result.monthlyInsurance)}`);
  if (result.monthlyHOA > 0) lines.push(`  HOA:                         ${fmtMo(result.monthlyHOA)}`);
  lines.push(`  Maintenance:                 ${fmtMo(result.monthlyMaintenance)}`);
  lines.push(``);
  lines.push(`  = ${fmtMo(result.totalMonthlyOwnershipCost)}`);
  return lines.join("\n");
}

/**
 * Hover tooltip for "Effective cost" = Total own cost + opportunity cost of
 * the down payment.
 */
export function effectiveCostTooltip(result: BuyVsRentResult, oppReturnPct: number): string {
  return [
    `Total own cost plus the opportunity cost of the`,
    `down payment + closing costs (what that cash`,
    `would earn if it stayed invested).`,
    ``,
    `  Total own cost:              ${fmtMo(result.totalMonthlyOwnershipCost)}`,
    `+ Opp. cost (${oppReturnPct}% return):    ${fmtMo(result.opportunityCostMonthly)}`,
    ``,
    `  = ${fmtMo(result.effectiveMonthlyOwnershipCost)}`,
  ].join("\n");
}

/**
 * Hover tooltip for "Net cost" = Effective cost minus deductions/appreciation.
 */
export function netCostTooltip(result: BuyVsRentResult): string {
  const lines: string[] = [
    `Effective cost minus deductions and appreciation.`,
    ``,
    `  Effective cost:              ${fmtMo(result.effectiveMonthlyOwnershipCost)}`,
  ];
  if (result.monthlyTaxSavings > 0) lines.push(`− Mortgage interest deduction: ${fmtMo(result.monthlyTaxSavings)}`);
  if (result.monthlyPropertyTaxSavings > 0) lines.push(`− Prop. tax SALT deduction:    ${fmtMo(result.monthlyPropertyTaxSavings)}`);
  if (result.monthlyAppreciation > 0) lines.push(`− Appreciation:                ${fmtMo(result.monthlyAppreciation)}`);
  lines.push(``);
  lines.push(`  = ${fmtMo(result.netMonthlyOwnershipCost)}`);
  return lines.join("\n");
}
