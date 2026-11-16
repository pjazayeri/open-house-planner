import type { Listing } from "../types";
import type { MortgageParams } from "./mortgageCalc";
import type { RentEstimate } from "../hooks/useRentEstimates";

/** Hash prefix for a shared single-property finance analysis (public, no sign-in). */
export const ANALYSIS_SHARE_PREFIX = "#analysis?bin=";

/** Every user-set input on the Finance page — exactly what a shared link freezes. */
export interface FinanceInputs {
  downPct: number;            // 0–100
  ratePct: number;            // the rate in effect (live or typed)
  termYears: 15 | 30;
  oppReturnPct: number;
  taxRatePct: number;
  appreciationPct: number;
  includeAppreciation: boolean;
  saltHeadroomK: number;      // thousands of dollars
  includePrincipal: boolean;
  holdYears: number;
  buyerClosingPct: number;
  sellerCostPct: number;
  rentInflationPct: number;
}

/**
 * MortgageParams for the monthly breakdown. Shared by FinancePage and the
 * shared-link view so a link always reproduces the owner's numbers.
 */
export function mortgageParamsFrom(i: FinanceInputs): MortgageParams {
  return {
    downPaymentPct: i.downPct / 100,
    annualRatePct: i.ratePct,
    termYears: i.termYears,
    opportunityReturnPct: i.oppReturnPct,
    includePrincipal: i.includePrincipal,
    marginalTaxRatePct: i.taxRatePct,
    appreciationRatePct: i.includeAppreciation ? i.appreciationPct : 0,
    saltHeadroomAnnual: i.saltHeadroomK * 1000,
    buyerClosingCostPct: i.buyerClosingPct,
  };
}

export interface FinanceShareSnapshot {
  kind: "finance";
  v: 1;
  sharedAt: string; // ISO
  listing: Listing;
  inputs: FinanceInputs;
  rentOverride: number | null;
  rentEstimate: RentEstimate | null;
}

export function buildFinanceShare(
  listing: Listing,
  inputs: FinanceInputs,
  rentOverride: number | null,
  rentEstimate: RentEstimate | null,
  now: Date = new Date(),
): FinanceShareSnapshot {
  // Drop per-user tour fields; nothing else on a Listing is private.
  const shared: Listing = { ...listing };
  delete shared.visitOrder;
  delete shared.timeSlot;
  return {
    kind: "finance",
    v: 1,
    sharedAt: now.toISOString(),
    listing: shared,
    inputs,
    rentOverride,
    rentEstimate,
  };
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Validate a fetched snapshot (it's public, untrusted JSON) and revive dates. */
export function parseFinanceShare(data: unknown): FinanceShareSnapshot | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.kind !== "finance" || d.v !== 1) return null;

  const l = d.listing as Record<string, unknown> | undefined;
  if (!l || typeof l.address !== "string" || !num(l.price) || l.price <= 0) return null;
  const b = l.capRateBreakdown as Record<string, unknown> | undefined;
  if (!b || !num(b.monthlyRent) || !num(b.propertyTax)) return null;

  const i = d.inputs as Record<string, unknown> | undefined;
  if (!i) return null;
  const numKeys = ["downPct", "ratePct", "oppReturnPct", "taxRatePct", "appreciationPct", "saltHeadroomK",
    "holdYears", "buyerClosingPct", "sellerCostPct", "rentInflationPct"] as const;
  if (!numKeys.every((k) => num(i[k]))) return null;
  if (i.termYears !== 15 && i.termYears !== 30) return null;
  if (typeof i.includePrincipal !== "boolean" || typeof i.includeAppreciation !== "boolean") return null;

  const est = d.rentEstimate as Record<string, unknown> | null | undefined;
  const rentEstimate: RentEstimate | null = est && num(est.rent)
    ? {
        rent: est.rent,
        low: num(est.low) ? est.low : est.rent,
        high: num(est.high) ? est.high : est.rent,
        comparables: num(est.comparables) ? est.comparables : 0,
        fetchedAt: typeof est.fetchedAt === "string" ? est.fetchedAt : "",
      }
    : null;

  return {
    kind: "finance",
    v: 1,
    sharedAt: typeof d.sharedAt === "string" ? d.sharedAt : "",
    listing: {
      ...(l as unknown as Listing),
      openHouseStart: new Date(l.openHouseStart as string),
      openHouseEnd: new Date(l.openHouseEnd as string),
    },
    inputs: i as unknown as FinanceInputs,
    rentOverride: num(d.rentOverride) ? d.rentOverride : null,
    rentEstimate,
  };
}
