export interface CapRateInput {
  price: number;
  beds: number;
  baths: number;
  sqft: number | null;
  yearBuilt: number | null;
  hoa: number | null;
  city: string;
  zip: string;
  propertyType: string;
}

export interface CapRateBreakdown {
  // Rent estimation
  rentPsf: number;
  rentPsfSource: string; // e.g. "zip 94102" | "city SF" | "default"
  effectiveSqft: number;
  sqftImputed: boolean;
  propertyTypeMultiplier: number;
  units: number;
  monthlyRent: number;

  // Expense line items (annual $)
  propertyTax: number;
  insurance: number;
  insuranceLabel: string;
  vacancy: number;
  maintenanceRate: number;
  maintenanceBeforeHoa: number;
  maintenance: number;
  hoaReductionLabel: string | null;
  management: number;
  annualHoa: number;

  // Totals
  annualGrossRent: number;
  totalExpenses: number;
  noi: number;
  capRate: number;
}

/**
 * Zip-level rent per square foot (monthly $/sqft).
 * Based on 2026 market data for SF and Irvine zips in the dataset.
 */
const ZIP_RENT_PSF: Record<string, number> = {
  // San Francisco zips
  "94102": 3.80, // Civic Center / Tenderloin — lower
  "94103": 4.00, // SoMa
  "94107": 4.20, // SoMa / Potrero
  "94108": 4.10, // Chinatown / Nob Hill
  "94109": 4.00, // Polk / Russian Hill
  "94111": 4.30, // Embarcadero / Financial
  "94123": 4.20, // Marina
  "94133": 3.90, // North Beach / Telegraph Hill
  // Irvine zips
  "92603": 2.60, // Turtle Rock / Shady Canyon
  "92618": 2.40, // Spectrum / Great Park
};

/** City-level fallback rent $/sqft */
const CITY_RENT_PSF: Record<string, number> = {
  "San Francisco": 4.00,
  "Irvine": 2.50,
};

const DEFAULT_RENT_PSF = 3.00;

/** Imputed sqft when listing has no sqft data (index = beds) */
const IMPUTED_SQFT_BY_BEDS = [475, 650, 900, 1200, 1600, 2100];

/** Property-type rent multiplier */
function rentMultiplier(propertyType: string): number {
  const pt = propertyType.toLowerCase();
  if (pt.includes("single family")) return 1.12;
  if (pt.includes("multi-family (5+)")) return 0.95;
  return 1.0;
}

/** Estimate unit count for multi-family from bath count */
function estimateUnits(propertyType: string, baths: number): number {
  const pt = propertyType.toLowerCase();
  if (pt.includes("multi-family (2-4)")) {
    return Math.max(2, Math.min(4, Math.round(baths)));
  }
  if (pt.includes("multi-family (5+)")) {
    return Math.max(5, Math.round(baths));
  }
  return 1;
}

function isMultiFamily(propertyType: string): boolean {
  const pt = propertyType.toLowerCase();
  return pt.includes("multi-family");
}

function getRentPsfWithSource(zip: string, city: string): { rate: number; source: string } {
  if (ZIP_RENT_PSF[zip] !== undefined) {
    return { rate: ZIP_RENT_PSF[zip], source: `zip ${zip}` };
  }
  if (CITY_RENT_PSF[city] !== undefined) {
    return { rate: CITY_RENT_PSF[city], source: `${city} avg` };
  }
  return { rate: DEFAULT_RENT_PSF, source: "default" };
}

function getEffectiveSqft(sqft: number | null, beds: number): { value: number; imputed: boolean } {
  if (sqft && sqft > 0) return { value: sqft, imputed: false };
  const idx = Math.min(beds, IMPUTED_SQFT_BY_BEDS.length - 1);
  return { value: IMPUTED_SQFT_BY_BEDS[idx], imputed: true };
}

/**
 * Compute full cap rate breakdown with all assumptions exposed.
 */
export function computeCapRateBreakdown(input: CapRateInput): CapRateBreakdown {
  const { rate: rentPsf, source: rentPsfSource } = getRentPsfWithSource(input.zip, input.city);
  const { value: effectiveSqft, imputed: sqftImputed } = getEffectiveSqft(input.sqft, input.beds);
  const propertyTypeMultiplier = rentMultiplier(input.propertyType);
  const units = isMultiFamily(input.propertyType)
    ? estimateUnits(input.propertyType, input.baths)
    : 1;

  // Rent
  let monthlyRent: number;
  if (units > 1) {
    const perUnitSqft = effectiveSqft / units;
    monthlyRent = perUnitSqft * rentPsf * propertyTypeMultiplier * units;
  } else {
    monthlyRent = effectiveSqft * rentPsf * propertyTypeMultiplier;
  }
  const annualGrossRent = monthlyRent * 12;

  // Expenses
  const pt = input.propertyType.toLowerCase();
  const isCondo = pt.includes("condo");
  const isMF = isMultiFamily(input.propertyType);

  const propertyTax = input.price * 0.011;

  let insuranceRate: number;
  let insuranceLabel: string;
  if (isCondo) {
    insuranceRate = 0.0015;
    insuranceLabel = "HO-6 condo";
  } else if (isMF) {
    insuranceRate = 0.004;
    insuranceLabel = "multi-family";
  } else {
    insuranceRate = 0.0035;
    insuranceLabel = "SFH";
  }
  const insurance = input.price * insuranceRate;

  const vacancy = annualGrossRent * 0.05;

  let maintenanceRate: number;
  if (!input.yearBuilt || input.yearBuilt < 1940) {
    maintenanceRate = 0.12;
  } else if (input.yearBuilt < 1980) {
    maintenanceRate = 0.10;
  } else if (input.yearBuilt < 2000) {
    maintenanceRate = 0.08;
  } else {
    maintenanceRate = 0.06;
  }
  const maintenanceBeforeHoa = annualGrossRent * maintenanceRate;
  let maintenance = maintenanceBeforeHoa;

  const annualHoa = (input.hoa ?? 0) * 12;
  let hoaReductionLabel: string | null = null;
  if (annualHoa > 0) {
    if (isCondo) {
      maintenance *= 0.40;
      hoaReductionLabel = "-60% (condo HOA)";
    } else {
      maintenance *= 0.75;
      hoaReductionLabel = "-25% (HOA)";
    }
  }

  const managementRate = pt.includes("multi-family (5+)") ? 0.08 : 0;
  const management = annualGrossRent * managementRate;

  const totalExpenses = propertyTax + insurance + vacancy + maintenance + management + annualHoa;
  const noi = annualGrossRent - totalExpenses;
  const capRate = input.price > 0 ? Math.max(0, (noi / input.price) * 100) : 0;

  return {
    rentPsf,
    rentPsfSource,
    effectiveSqft,
    sqftImputed,
    propertyTypeMultiplier,
    units,
    monthlyRent,
    propertyTax,
    insurance,
    insuranceLabel,
    vacancy,
    maintenanceRate,
    maintenanceBeforeHoa,
    maintenance,
    hoaReductionLabel,
    management,
    annualHoa,
    annualGrossRent,
    totalExpenses,
    noi,
    capRate,
  };
}

/**
 * Estimate cap rate for a listing (convenience wrapper).
 */
export function estimateCapRate(input: CapRateInput): number {
  return computeCapRateBreakdown(input).capRate;
}
