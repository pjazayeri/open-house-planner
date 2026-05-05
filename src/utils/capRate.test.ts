import { describe, it, expect } from "vitest";
import { computeCapRateBreakdown } from "./capRate";

const BASE = {
  price: 1_000_000,
  beds: 2,
  baths: 2,
  sqft: 1000,
  yearBuilt: 2010,
  hoa: null,
  city: "San Francisco",
  zip: "94115", // Pacific Heights — $4.30/sqft
  propertyType: "Condo/Co-op",
};

describe("computeCapRateBreakdown", () => {
  it("returns a non-negative cap rate", () => {
    const b = computeCapRateBreakdown(BASE);
    expect(b.capRate).toBeGreaterThan(0);
  });

  it("uses zip-level rent PSF when available", () => {
    const b = computeCapRateBreakdown(BASE);
    expect(b.rentPsf).toBe(4.30);
    expect(b.rentPsfSource).toBe("zip 94115");
  });

  it("falls back to city-level rent PSF for unknown zip", () => {
    const b = computeCapRateBreakdown({ ...BASE, zip: "99999" });
    expect(b.rentPsf).toBe(4.00);
    expect(b.rentPsfSource).toBe("San Francisco avg");
  });

  it("falls back to default rent PSF for unknown city and zip", () => {
    const b = computeCapRateBreakdown({ ...BASE, city: "Unknown City", zip: "00000" });
    expect(b.rentPsf).toBe(3.00);
    expect(b.rentPsfSource).toBe("default");
  });

  it("imputes sqft when listing has none", () => {
    const b = computeCapRateBreakdown({ ...BASE, sqft: null });
    expect(b.sqftImputed).toBe(true);
    expect(b.effectiveSqft).toBeGreaterThan(0);
  });

  it("does not impute sqft when listing has one", () => {
    const b = computeCapRateBreakdown(BASE);
    expect(b.sqftImputed).toBe(false);
    expect(b.effectiveSqft).toBe(1000);
  });

  it("applies SFH rent multiplier", () => {
    const condo = computeCapRateBreakdown({ ...BASE, propertyType: "Condo/Co-op" });
    const sfh = computeCapRateBreakdown({ ...BASE, propertyType: "Single Family Residential" });
    expect(sfh.monthlyRent).toBeGreaterThan(condo.monthlyRent);
    expect(sfh.propertyTypeMultiplier).toBe(1.12);
  });

  it("estimates multiple units for multi-family", () => {
    const b = computeCapRateBreakdown({ ...BASE, propertyType: "Multi-Family (2-4 Unit)", baths: 3 });
    expect(b.units).toBeGreaterThan(1);
  });

  it("reduces maintenance for condo with HOA", () => {
    const noHoa = computeCapRateBreakdown({ ...BASE, hoa: null });
    const withHoa = computeCapRateBreakdown({ ...BASE, hoa: 800 });
    expect(withHoa.maintenance).toBeLessThan(noHoa.maintenance);
    expect(withHoa.hoaReductionLabel).toContain("-60%");
  });

  it("uses higher maintenance rate for pre-1940 buildings", () => {
    const old = computeCapRateBreakdown({ ...BASE, yearBuilt: 1920 });
    const recent = computeCapRateBreakdown({ ...BASE, yearBuilt: 2020 });
    expect(old.maintenanceRate).toBeGreaterThan(recent.maintenanceRate);
  });

  it("adds management expense for 5+ unit properties", () => {
    const mf5 = computeCapRateBreakdown({ ...BASE, propertyType: "Multi-Family (5+ Unit)", baths: 6 });
    expect(mf5.management).toBeGreaterThan(0);
  });

  it("management is zero for condos", () => {
    const b = computeCapRateBreakdown(BASE);
    expect(b.management).toBe(0);
  });

  it("cap rate is 0 when price is 0", () => {
    const b = computeCapRateBreakdown({ ...BASE, price: 0 });
    expect(b.capRate).toBe(0);
  });

  it("property tax is 1.1% of price", () => {
    const b = computeCapRateBreakdown(BASE);
    expect(b.propertyTax).toBeCloseTo(BASE.price * 0.011);
  });

  it("NOI equals annualGrossRent minus totalExpenses", () => {
    const b = computeCapRateBreakdown(BASE);
    expect(b.noi).toBeCloseTo(b.annualGrossRent - b.totalExpenses);
  });
});
