import { useState, useEffect, useMemo, useRef } from "react";
import type { Listing, VisitRecord } from "../../types";
import { calcBuyVsRent, calcTimeSeries, type BuyVsRentResult, type TimeSeriesPoint } from "../../utils/mortgageCalc";
import { getNeighborhoods } from "../../utils/filterListings";
import { formatPrice, formatBedsBaths } from "../../utils/formatters";
import "./FinancePage.css";

interface FinancePageProps {
  allListings: Listing[];
  visits: Record<string, VisitRecord>;
  priorityIds: Set<string>;
  hiddenIds: Set<string>;
  initialSelectedId?: string | null;
}

type SortKey = "price" | "cost" | "premium" | "capRate" | "ppsf" | "coc";

const LS_DOWN = "finance-down-pct";
const LS_RATE = "finance-rate";
const LS_OPP  = "finance-opp-return";
const LS_PRINCIPAL = "finance-include-principal";
const LS_RENT_OVERRIDES = "finance-rent-overrides";
const LS_TAX_RATE = "finance-tax-rate";
const LS_APPRECIATION = "finance-appreciation";
const LS_SALT_HEADROOM = "finance-salt-headroom";
const LS_INCLUDE_APPRECIATION = "finance-include-appreciation";
const LS_HOLD_YEARS = "finance-hold-years";
const LS_BUYER_CLOSING = "finance-buyer-closing";
const LS_SELLER_COST = "finance-seller-cost";
const LS_RENT_INFLATION = "finance-rent-inflation";

function readLs(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) {
      const n = parseFloat(v);
      if (!isNaN(n)) return n;
    }
  } catch {}
  return fallback;
}

/** Controlled number input — allows free editing (empty, partial) and only commits on blur. */
function NumInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  width = 58,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
}) {
  const [raw, setRaw] = useState(String(value));

  // Sync when parent updates (e.g. FRED fetch)
  useEffect(() => { setRaw(String(value)); }, [value]);

  return (
    <input
      className="fp-num-input"
      type="number"
      min={min}
      max={max}
      step={step}
      style={{ width }}
      value={raw}
      onChange={(e) => {
        setRaw(e.target.value);
        const n = parseFloat(e.target.value);
        if (!isNaN(n)) onChange(n);
      }}
      onBlur={() => {
        // On blur, clamp and normalize display
        const n = parseFloat(raw);
        const safe = isNaN(n) ? value : (min !== undefined ? Math.max(min, n) : n);
        onChange(safe);
        setRaw(String(safe));
      }}
    />
  );
}

function fmtMo(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US") + " / mo";
}

function fmtDollar(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}


function premiumLabel(premium: number): string {
  if (premium >= 0) return `+${fmtDollar(premium)} / mo`;
  return `−${fmtDollar(Math.abs(premium))} / mo savings`;
}

function premiumClass(premium: number): string {
  if (premium < 0) return "premium-negative";
  if (premium <= 500) return "premium-neutral";
  return "premium-positive";
}

function accentClass(premium: number, capRate: number): string {
  if (premium < 0 || capRate >= 3.5) return "accent-green";
  if (premium <= 500) return "accent-yellow";
  return "accent-red";
}

function capBadgeClass(capRate: number): string {
  if (capRate >= 3.5) return "fp-cap-badge--good";
  if (capRate >= 2.0) return "fp-cap-badge--ok";
  return "fp-cap-badge--low";
}

// ── Tooltip ───────────────────────────────────────────────────────
function Tip({ children, tip }: { children: React.ReactNode; tip: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="fp-tip-wrap"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="fp-tip-val">{children}</span>
      {show && (
        <div className="fp-tip" role="tooltip">
          <pre>{tip}</pre>
        </div>
      )}
    </span>
  );
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "$" + Math.round(n / 1_000) + "k";
  return "$" + Math.round(n);
}

// ── Time series chart ─────────────────────────────────────────────
function TimeChart({ points }: { points: TimeSeriesPoint[] }) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length === 0) return null;
  const W = 460, H = 200, PAD_L = 52, PAD_R = 12, PAD_T = 12, PAD_B = 28;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allVals = points.flatMap((p) => [p.netBuyCost, p.cumulativeRentCost]);
  const minV = Math.min(0, ...allVals);
  const maxV = Math.max(...allVals);
  const range = maxV - minV || 1;

  const xOf = (year: number) => PAD_L + ((year - 1) / (points.length - 1 || 1)) * chartW;
  const yOf = (v: number) => PAD_T + chartH - ((v - minV) / range) * chartH;

  const buyPts = points.map((p) => `${xOf(p.year)},${yOf(p.netBuyCost)}`).join(" ");
  const rentPts = points.map((p) => `${xOf(p.year)},${yOf(p.cumulativeRentCost)}`).join(" ");

  // Break-even year: where buy net cost crosses below rent cost
  const breakEvenYear = points.find((p, i) => {
    if (i === 0) return false;
    const prev = points[i - 1];
    return prev.netBuyCost > prev.cumulativeRentCost && p.netBuyCost <= p.cumulativeRentCost;
  })?.year ?? null;

  // Y-axis ticks
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => minV + (range * i) / tickCount);

  const zeroY = yOf(0);

  const hoverPoint = hoverYear !== null ? (points.find((p) => p.year === hoverYear) ?? null) : null;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const yearFrac = ((svgX - PAD_L) / chartW) * (points.length - 1) + 1;
    const year = Math.round(Math.max(1, Math.min(points.length, yearFrac)));
    setHoverYear(year);
  }

  const TT_W = 110, TT_H = 46, TT_PAD = 6;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="fp-time-chart"
      aria-label="Buy vs Rent over time"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverYear(null)}
      style={{ cursor: "crosshair" }}
    >
      {/* Zero line */}
      {minV < 0 && maxV > 0 && (
        <line x1={PAD_L} y1={zeroY} x2={W - PAD_R} y2={zeroY} stroke="#334155" strokeWidth={1} strokeDasharray="3 3" />
      )}
      {/* Y-axis ticks */}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={PAD_L - 4} y1={yOf(v)} x2={PAD_L} y2={yOf(v)} stroke="#475569" strokeWidth={1} />
          <text x={PAD_L - 6} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill="#64748b">{fmtK(v)}</text>
        </g>
      ))}
      {/* X-axis labels */}
      {points.filter((p) => p.year % 5 === 0 || p.year === 1).map((p) => (
        <text key={p.year} x={xOf(p.year)} y={H - 6} textAnchor="middle" fontSize={9} fill="#64748b">yr{p.year}</text>
      ))}
      {/* Axes */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#475569" strokeWidth={1} />
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#475569" strokeWidth={1} />
      {/* Rent line (amber) */}
      <polyline points={rentPts} fill="none" stroke="#f59e0b" strokeWidth={2} />
      {/* Buy net cost line (purple) */}
      <polyline points={buyPts} fill="none" stroke="#a78bfa" strokeWidth={2} />
      {/* Break-even marker */}
      {breakEvenYear !== null && (() => {
        const p = points.find((pt) => pt.year === breakEvenYear)!;
        return (
          <g>
            <circle cx={xOf(p.year)} cy={yOf(p.netBuyCost)} r={4} fill="#22c55e" />
            <text x={xOf(p.year) + 6} y={yOf(p.netBuyCost) - 4} fontSize={9} fill="#22c55e">yr{p.year}</text>
          </g>
        );
      })()}
      {/* Legend */}
      <g>
        <line x1={PAD_L + 4} y1={PAD_T + 6} x2={PAD_L + 18} y2={PAD_T + 6} stroke="#a78bfa" strokeWidth={2} />
        <text x={PAD_L + 22} y={PAD_T + 10} fontSize={9} fill="#a78bfa">Buy net cost</text>
        <line x1={PAD_L + 90} y1={PAD_T + 6} x2={PAD_L + 104} y2={PAD_T + 6} stroke="#f59e0b" strokeWidth={2} />
        <text x={PAD_L + 108} y={PAD_T + 10} fontSize={9} fill="#f59e0b">Rent</text>
        {breakEvenYear !== null && (
          <>
            <circle cx={PAD_L + 158} cy={PAD_T + 6} r={3} fill="#22c55e" />
            <text x={PAD_L + 164} y={PAD_T + 10} fontSize={9} fill="#22c55e">Break-even</text>
          </>
        )}
      </g>
      {/* Hover crosshair + tooltip */}
      {hoverPoint && (() => {
        const cx = xOf(hoverPoint.year);
        const ttX = cx + 8 + TT_W > W - PAD_R ? cx - 8 - TT_W : cx + 8;
        const ttY = PAD_T + chartH / 2 - TT_H / 2;
        return (
          <g pointerEvents="none">
            <line x1={cx} y1={PAD_T} x2={cx} y2={H - PAD_B} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={cx} cy={yOf(hoverPoint.netBuyCost)} r={3.5} fill="#a78bfa" />
            <circle cx={cx} cy={yOf(hoverPoint.cumulativeRentCost)} r={3.5} fill="#f59e0b" />
            <rect x={ttX} y={ttY} width={TT_W} height={TT_H} rx={4} fill="#1e293b" stroke="#334155" strokeWidth={1} />
            <text x={ttX + TT_PAD} y={ttY + TT_PAD + 9} fontSize={9} fill="#94a3b8" fontWeight="600">yr {hoverPoint.year}</text>
            <text x={ttX + TT_PAD} y={ttY + TT_PAD + 22} fontSize={9} fill="#a78bfa">Buy: {fmtK(hoverPoint.netBuyCost)}</text>
            <text x={ttX + TT_PAD} y={ttY + TT_PAD + 35} fontSize={9} fill="#f59e0b">Rent: {fmtK(hoverPoint.cumulativeRentCost)}</text>
          </g>
        );
      })()}
    </svg>
  );
}

// ── Compact list item ────────────────────────────────────────────
interface ListItemProps {
  listing: Listing;
  result: BuyVsRentResult;
  selected: boolean;
  onClick: () => void;
}

function cocClass(coc: number): string {
  if (coc >= 4) return "coc-good";
  if (coc >= 0) return "coc-ok";
  return "coc-bad";
}

function ListItem({ listing, result, selected, onClick }: ListItemProps) {
  const accent = accentClass(result.monthlyBuyPremium, listing.capRate);
  const coc = result.cashOnCashReturnPct;
  return (
    <button
      className={`fp-list-item ${accent} ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="fp-li-address">{listing.address}</div>
      <div className="fp-li-meta">
        {formatPrice(listing.price)} · {formatBedsBaths(listing.beds, listing.baths)}
      </div>
      <div className="fp-li-bottom">
        <span className={`fp-li-premium ${premiumClass(result.monthlyBuyPremium)}`}>
          {premiumLabel(result.monthlyBuyPremium)}
        </span>
        <span className={`fp-li-coc ${cocClass(coc)}`} title="Cash-on-cash return">
          {coc >= 0 ? "+" : ""}{coc.toFixed(1)}% CoC
        </span>
      </div>
    </button>
  );
}

// ── Detail panel ─────────────────────────────────────────────────
interface DetailProps {
  listing: Listing;
  result: BuyVsRentResult;
  downPct: number;
  ratePct: number;
  termYears: number;
  oppReturnPct: number;
  taxRatePct: number;
  appreciationPct: number;
  saltHeadroom: number;
  includePrincipal: boolean;
  rentOverride: number | null;
  onSetRentOverride: (rent: number | null) => void;
  // time series params (lifted so they persist across selection changes)
  holdYears: number;
  setHoldYears: (n: number) => void;
  buyerClosingPct: number;
  setBuyerClosingPct: (n: number) => void;
  sellerCostPct: number;
  setSellerCostPct: (n: number) => void;
  rentInflationPct: number;
  setRentInflationPct: (n: number) => void;
}

function DetailPanel({ listing, result, downPct, ratePct, termYears, oppReturnPct, taxRatePct, appreciationPct, saltHeadroom, includePrincipal, rentOverride, onSetRentOverride, holdYears, setHoldYears, buyerClosingPct, setBuyerClosingPct, sellerCostPct, setSellerCostPct, rentInflationPct, setRentInflationPct }: DetailProps) {
  const [thumbError, setThumbError] = useState(false);
  const thumbSrc = `/api/thumbnail/${listing.id}`;

  const params = useMemo(() => ({
    downPaymentPct: downPct / 100,
    annualRatePct: ratePct,
    termYears,
    opportunityReturnPct: oppReturnPct,
    includePrincipal,
    marginalTaxRatePct: taxRatePct,
    appreciationRatePct: appreciationPct,
    saltHeadroomAnnual: saltHeadroom * 1000,
    buyerClosingCostPct: buyerClosingPct,
  }), [downPct, ratePct, termYears, oppReturnPct, includePrincipal, taxRatePct, appreciationPct, saltHeadroom, buyerClosingPct]);

  const timeSeries = useMemo(() => calcTimeSeries(
    listing,
    params,
    { holdYears, buyerClosingCostPct: buyerClosingPct, sellerCostPct, rentInflationPct },
    rentOverride ?? undefined,
  ), [listing, params, holdYears, buyerClosingPct, sellerCostPct, rentInflationPct, rentOverride]);
  const accent = accentClass(result.monthlyBuyPremium, listing.capRate);
  const b = listing.capRateBreakdown;

  // ── Tooltip text per row ──────────────────────────────────────
  const tipInterest = [
    `The cost of borrowing — paid to the lender, never recovered.`,
    ``,
    `${fmtDollar(result.loanAmount)} loan at ${ratePct}% for ${termYears}yr`,
    `First month: ${fmtDollar(result.loanAmount)} × ${ratePct}% ÷ 12`,
    `= ${fmtDollar(result.monthlyInterest)}/mo`,
    ``,
    `(Shrinks each month as your balance decreases)`,
  ].join("\n");

  const tipPrincipal = [
    `Repays your loan balance — this is equity you keep.`,
    ``,
    `First month: ${fmtDollar(result.monthlyPI - result.monthlyInterest)}/mo`,
    `(Grows each month as interest shrinks)`,
    ``,
    `${includePrincipal ? "Currently counted as a cost above." : "Currently excluded from your cost total."}`,
  ].join("\n");

  const taxRate = (b.propertyTax / listing.price * 100).toFixed(2);
  const tipTax = [
    `${formatPrice(listing.price)} × ${taxRate}% ÷ 12`,
    `Standard CA property tax rate`,
  ].join("\n");

  const insRate = (b.insurance / listing.price * 100).toFixed(2);
  const tipIns = [
    `${formatPrice(listing.price)} × ${insRate}% ÷ 12`,
    `Rate: ${insRate}% — ${b.insuranceLabel}`,
  ].join("\n");

  const maintLines = [
    `${(b.maintenanceRate * 100).toFixed(0)}% of annual gross rent`,
    `Annual gross rent: ${fmtDollar(b.annualGrossRent)}/yr`,
  ];
  if (listing.yearBuilt) maintLines.push(`Age-based rate (built ${listing.yearBuilt})`);
  if (b.hoaReductionLabel) maintLines.push(`Reduced: ${b.hoaReductionLabel}`);
  const tipMaint = maintLines.join("\n");

  const rentLines = [
    `$${b.rentPsf.toFixed(2)}/sqft/mo — source: ${b.rentPsfSource}`,
    `× ${b.effectiveSqft.toLocaleString()} sqft${b.sqftImputed ? ` (imputed from ${listing.beds}bd)` : ""}`,
  ];
  if (b.propertyTypeMultiplier !== 1.0)
    rentLines.push(`× ${b.propertyTypeMultiplier.toFixed(2)} multiplier (${listing.propertyType})`);
  if (b.units > 1) rentLines.push(`× ${b.units} units`);
  rentLines.push(`= ${fmtDollar(b.monthlyRent)}/mo gross`);
  const tipRent = rentLines.join("\n");

  const tipOpp = [
    `If the down payment were invested instead:`,
    `${fmtDollar(result.downPayment)} × ${oppReturnPct}% / 12`,
    `Assumed annual return: ${oppReturnPct}% (configurable above)`,
  ].join("\n");

  const annualInterest = result.monthlyInterest * 12;
  const tipTaxSavings = [
    `Mortgage interest deduction (federal only).`,
    ``,
    `First-month interest: ${fmtDollar(result.monthlyInterest)}/mo`,
    `× ${taxRatePct}% marginal tax rate`,
    `= ${fmtDollar(result.monthlyTaxSavings)}/mo savings`,
    ``,
    `SALT cap: $40k/yr under OBBBA (signed Jul 2025).`,
    `Phase-out (30% of excess) starts at $500k MAGI`,
    `for single AND joint filers; $250k for married`,
    `filing separately. Floor: $10k minimum.`,
    ``,
    `Single, $300k MAGI → no phase-out (below $500k).`,
    `Full $40k cap applies.`,
    `CA income tax ~$30k → ~$10k SALT headroom`,
    `remaining for property tax deduction.`,
    ``,
    `Note: property tax SALT benefit not counted here`,
    `(only mortgage interest is tracked in this row).`,
    ``,
    `Itemizing beats standard deduction (~$15.7k single`,
    `2025) if SALT + ~${fmtDollar(annualInterest)}/yr interest + charitable`,
    `exceeds that — very likely here.`,
    ``,
    `Set tax rate to 0 to exclude entirely.`,
  ].join("\n");

  const deductiblePropTax = Math.min(b.propertyTax, saltHeadroom * 1000);
  const tipPropTaxSavings = [
    `Property tax SALT deduction.`,
    ``,
    `Annual property tax: ${fmtDollar(b.propertyTax)}`,
    `SALT headroom remaining: ${fmtDollar(saltHeadroom * 1000)}`,
    `Deductible: ${fmtDollar(deductiblePropTax)} × ${taxRatePct}% ÷ 12`,
    `= ${fmtDollar(result.monthlyPropertyTaxSavings)}/mo savings`,
    ``,
    `Set SALT headroom to 0 if your state income tax`,
    `already exhausts your full $40k cap.`,
  ].join("\n");

  const tipAppreciation = [
    `Assumed property appreciation builds equity.`,
    ``,
    `${formatPrice(listing.price)} × ${appreciationPct}% ÷ 12`,
    `= ${fmtDollar(result.monthlyAppreciation)}/mo equity gain`,
    ``,
    `This reduces your net monthly cost.`,
    `Set to 0 to exclude.`,
  ].join("\n");

  const tipBuyPremium = [
    `Net cost − Est. rent`,
    `${fmtDollar(result.netMonthlyOwnershipCost)} − ${fmtDollar(result.estimatedMonthlyRent)}`,
    result.monthlyBuyPremium >= 0
      ? `Positive = buying costs more than renting`
      : `Negative = buying is cheaper than renting`,
  ].join("\n");

  const tipCoC = [
    `Cash-on-cash return — annual pre-tax cash flow`,
    `divided by total cash invested.`,
    ``,
    `Annual cash flow:`,
    `  Rent − P&I − prop tax − insurance − HOA − maint`,
    `  = ${fmtDollar(result.annualCashFlow / 12)}/mo × 12 = ${fmtDollar(result.annualCashFlow)}/yr`,
    ``,
    `Total cash invested:`,
    `  Down payment: ${fmtDollar(result.downPayment)}`,
    `  Buyer closing (${buyerClosingPct}%): ${fmtDollar(result.totalCashInvested - result.downPayment)}`,
    `  Total: ${fmtDollar(result.totalCashInvested)}`,
    ``,
    `CoC = ${fmtDollar(result.annualCashFlow)} / ${fmtDollar(result.totalCashInvested)}`,
    `    = ${result.cashOnCashReturnPct.toFixed(2)}%`,
    ``,
    `Note: pure cash metric — excludes appreciation,`,
    `tax savings, and opportunity cost.`,
  ].join("\n");

  return (
    <div className={`fp-detail ${accent}`}>
      <div className="fp-detail-columns">
      <div className="fp-detail-left">
      <div className="fp-detail-hero">
        {thumbError ? (
          <div className="fp-detail-thumb fp-detail-thumb-ph">🏠</div>
        ) : (
          <img className="fp-detail-thumb" src={thumbSrc} alt="" onError={() => setThumbError(true)} />
        )}
        <div className="fp-detail-meta">
          <div className="fp-detail-address">{listing.address}</div>
          <div className="fp-detail-sub">
            {formatPrice(listing.price)}
            {listing.sqft ? ` · ${listing.sqft.toLocaleString()} sqft` : ""}
            {` · ${formatBedsBaths(listing.beds, listing.baths)}`}
            {listing.pricePerSqft ? ` · $${Math.round(listing.pricePerSqft).toLocaleString()}/sqft` : ""}
          </div>
          <div className="fp-detail-badges">
            <span className={`fp-cap-badge ${capBadgeClass(listing.capRate)}`}>
              {listing.capRate.toFixed(2)}% cap
            </span>
            <a
              className="fp-redfin-link"
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Redfin ↗
            </a>
          </div>
        </div>
      </div>

      <div className="fp-breakdown">
        <div className="fp-bd-row">
          <span className="fp-bd-label">Down payment</span>
          <span className="fp-bd-val">{fmtDollar(result.downPayment)} ({downPct}%)</span>
        </div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Loan amount</span>
          <span className="fp-bd-val">{fmtDollar(result.loanAmount)}</span>
        </div>
        <hr className="fp-divider" />
        <div className="fp-bd-row">
          <span className="fp-bd-label">Interest / mo</span>
          <Tip tip={tipInterest}>{fmtMo(result.monthlyInterest)}</Tip>
        </div>
        <div className={`fp-bd-row${includePrincipal ? "" : " muted"}`}>
          <span className="fp-bd-label">
            Principal / mo
            {!includePrincipal && <span className="fp-excluded-tag"> (excluded)</span>}
          </span>
          <Tip tip={tipPrincipal}>{fmtMo(result.monthlyPrincipal)}</Tip>
        </div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Property tax</span>
          <Tip tip={tipTax}>{fmtMo(result.monthlyPropertyTax)}</Tip>
        </div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Insurance</span>
          <Tip tip={tipIns}>{fmtMo(result.monthlyInsurance)}</Tip>
        </div>
        {result.monthlyHOA > 0 && (
          <div className="fp-bd-row">
            <span className="fp-bd-label">HOA</span>
            <span className="fp-bd-val">{fmtMo(result.monthlyHOA)}</span>
          </div>
        )}
        <div className="fp-bd-row">
          <span className="fp-bd-label">Maintenance</span>
          <Tip tip={tipMaint}>{fmtMo(result.monthlyMaintenance)}</Tip>
        </div>
        <hr className="fp-divider" />
        <div className="fp-bd-row total">
          <span className="fp-bd-label">Total own cost</span>
          <span className="fp-bd-val">{fmtMo(result.totalMonthlyOwnershipCost)}</span>
        </div>
        <div className="fp-bd-row muted">
          <span className="fp-bd-label">+ Opp. cost</span>
          <Tip tip={tipOpp}>{fmtMo(result.opportunityCostMonthly)}</Tip>
        </div>
        <div className="fp-bd-row effective">
          <span className="fp-bd-label">Effective cost</span>
          <span className="fp-bd-val">{fmtMo(result.effectiveMonthlyOwnershipCost)}</span>
        </div>
        {result.monthlyTaxSavings > 0 && (
          <div className="fp-bd-row benefit">
            <span className="fp-bd-label">− Mortgage interest deduction ({taxRatePct}%)</span>
            <Tip tip={tipTaxSavings}><span className="fp-bd-val benefit-val">{fmtMo(result.monthlyTaxSavings)}</span></Tip>
          </div>
        )}
        {result.monthlyPropertyTaxSavings > 0 && (
          <div className="fp-bd-row benefit">
            <span className="fp-bd-label">− Prop. tax SALT deduction ({taxRatePct}%)</span>
            <Tip tip={tipPropTaxSavings}><span className="fp-bd-val benefit-val">{fmtMo(result.monthlyPropertyTaxSavings)}</span></Tip>
          </div>
        )}
        {result.monthlyAppreciation > 0 && (
          <div className="fp-bd-row benefit">
            <span className="fp-bd-label">− Appreciation ({appreciationPct}%/yr)</span>
            <Tip tip={tipAppreciation}><span className="fp-bd-val benefit-val">{fmtMo(result.monthlyAppreciation)}</span></Tip>
          </div>
        )}
        {(result.monthlyTaxSavings > 0 || result.monthlyPropertyTaxSavings > 0 || result.monthlyAppreciation > 0) && (
          <div className="fp-bd-row net-cost">
            <span className="fp-bd-label">Net cost</span>
            <span className="fp-bd-val">{fmtMo(result.netMonthlyOwnershipCost)}</span>
          </div>
        )}
        <div className="fp-bd-row fp-bd-row--rent">
          <span className="fp-bd-label">
            Est. rent
            {rentOverride !== null && (
              <button
                className="fp-rent-reset"
                title="Reset to estimated rent"
                onClick={() => onSetRentOverride(null)}
              >↺</button>
            )}
          </span>
          <div className="fp-rent-edit">
            <span className="fp-rent-prefix">$</span>
            <input
              className="fp-rent-input"
              type="number"
              min={0}
              step={50}
              value={rentOverride ?? Math.round(result.estimatedMonthlyRent)}
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                if (!isNaN(n) && n >= 0) onSetRentOverride(n);
              }}
              title="Override estimated rent"
            />
            <span className="fp-rent-suffix">/ mo</span>
            {rentOverride === null && (
              <Tip tip={tipRent}><span className="fp-rent-auto">auto</span></Tip>
            )}
          </div>
        </div>
        <hr className="fp-divider" />
        <div className={`fp-bd-row ${premiumClass(result.monthlyBuyPremium)}`}>
          <span className="fp-bd-label">Buy premium</span>
          <Tip tip={tipBuyPremium}>
            <span className="fp-bd-val--lg">{premiumLabel(result.monthlyBuyPremium)}</span>
          </Tip>
        </div>
        <div className={`fp-bd-row ${cocClass(result.cashOnCashReturnPct)}`}>
          <span className="fp-bd-label">Cash-on-cash return</span>
          <Tip tip={tipCoC}>
            <span className="fp-bd-val--lg">{result.cashOnCashReturnPct >= 0 ? "+" : ""}{result.cashOnCashReturnPct.toFixed(2)}%</span>
          </Tip>
        </div>
      </div>

      </div>{/* end fp-detail-left */}

      <div className="fp-detail-right">
      {/* ── Time Analysis ── */}
      <div className="fp-time-section">
        <div className="fp-time-header">
          <span>
            📈 Time Analysis
            <Tip tip={[
              `Chart shows cumulative costs over time.`,
              ``,
              `Purple line — "Buy net cost"`,
              `  Total cash out (P&I + all expenses + opp cost`,
              `  − tax savings) minus what you'd net from`,
              `  selling that year (home value − balance`,
              `  − seller costs).`,
              ``,
              `Amber line — "Rent"`,
              `  Cumulative rent paid (with annual inflation).`,
              ``,
              `Green dot — break-even year`,
              `  The year where buying-then-selling becomes`,
              `  cheaper than having rented the whole time.`,
              ``,
              `Seller costs affect break-even because they`,
              `reduce sale proceeds at every year on the`,
              `chart — the purple line always assumes you`,
              `sell at that point.`,
            ].join("\n")}>
              <span className="fp-time-info">ⓘ</span>
            </Tip>
          </span>
        </div>

        <div className="fp-time-body">
            <div className="fp-time-inputs">
              <div className="fp-input-group">
                <label>Hold</label>
                <NumInput value={holdYears} onChange={setHoldYears} min={1} max={30} step={1} width={44} />
                <span>yr</span>
              </div>
              <div className="fp-input-group">
                <label>Buyer closing</label>
                <NumInput value={buyerClosingPct} onChange={setBuyerClosingPct} min={0} max={10} step={0.25} width={44} />
                <span>%</span>
              </div>
              <div className="fp-input-group">
                <label>Seller costs</label>
                <NumInput value={sellerCostPct} onChange={setSellerCostPct} min={0} max={15} step={0.5} width={44} />
                <span>%</span>
              </div>
              <div className="fp-input-group">
                <label>Rent inflation</label>
                <NumInput value={rentInflationPct} onChange={setRentInflationPct} min={0} max={15} step={0.5} width={44} />
                <span>%/yr</span>
              </div>
            </div>

            <TimeChart points={timeSeries} />

            {/* Sell scenario table */}
            {(() => {
              const pt = timeSeries.find((p) => p.year === holdYears) ?? timeSeries[timeSeries.length - 1];
              if (!pt) return null;
              const buyWins = pt.netBuyCost < pt.cumulativeRentCost;
              return (
                <div className="fp-sell-table">
                  <div className="fp-bd-row total">
                    <span className="fp-bd-label">Sell in yr {pt.year} scenario</span>
                    <span />
                  </div>
                  <div className="fp-bd-row">
                    <span className="fp-bd-label">Home value</span>
                    <span className="fp-bd-val">{fmtDollar(pt.homeValue)}</span>
                  </div>
                  <div className="fp-bd-row">
                    <span className="fp-bd-label">Remaining balance</span>
                    <span className="fp-bd-val">{fmtDollar(pt.remainingBalance)}</span>
                  </div>
                  <div className="fp-bd-row">
                    <span className="fp-bd-label">Seller costs ({sellerCostPct}%)</span>
                    <span className="fp-bd-val">−{fmtDollar(pt.homeValue * sellerCostPct / 100)}</span>
                  </div>
                  <div className="fp-bd-row total">
                    <span className="fp-bd-label">Net sale proceeds</span>
                    <span className={`fp-bd-val ${pt.saleProceeds >= 0 ? "benefit-val" : "premium-positive"}`}>{pt.saleProceeds >= 0 ? "+" : ""}{fmtDollar(pt.saleProceeds)}</span>
                  </div>
                  <hr className="fp-divider" />
                  <div className="fp-bd-row">
                    <span className="fp-bd-label">Total buy cash out</span>
                    <span className="fp-bd-val">{fmtDollar(pt.cumulativeBuyCashOut)}</span>
                  </div>
                  <div className="fp-bd-row net-cost">
                    <span className="fp-bd-label">Buy net cost</span>
                    <span className={`fp-bd-val ${pt.netBuyCost <= 0 ? "benefit-val" : ""}`}>{fmtDollar(pt.netBuyCost)}</span>
                  </div>
                  <div className="fp-bd-row net-cost">
                    <span className="fp-bd-label">Total rent cost</span>
                    <span className="fp-bd-val">{fmtDollar(pt.cumulativeRentCost)}</span>
                  </div>
                  <div className={`fp-bd-row ${buyWins ? "benefit" : ""}`} style={{ marginTop: 6 }}>
                    <span className="fp-bd-label">Verdict</span>
                    <span className={`fp-bd-val ${buyWins ? "benefit-val" : "premium-positive"}`}>
                      {buyWins
                        ? `Buy saves ${fmtDollar(pt.cumulativeRentCost - pt.netBuyCost)}`
                        : `Rent saves ${fmtDollar(pt.netBuyCost - pt.cumulativeRentCost)}`}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
      </div>{/* end fp-time-section */}
      </div>{/* end fp-detail-right */}
      </div>{/* end fp-detail-columns */}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export function FinancePage({ allListings, initialSelectedId }: FinancePageProps) {
  const [downPct, setDownPct] = useState(() => readLs(LS_DOWN, 20));
  const [ratePct, setRatePct] = useState(() => readLs(LS_RATE, 6.75));
  const [oppReturnPct, setOppReturnPct] = useState(() => readLs(LS_OPP, 7));
  const [taxRatePct, setTaxRatePct] = useState(() => readLs(LS_TAX_RATE, 28));
  const [appreciationPct, setAppreciationPct] = useState(() => readLs(LS_APPRECIATION, 3));
  const [saltHeadroom, setSaltHeadroom] = useState(() => readLs(LS_SALT_HEADROOM, 10));
  const [termYears, setTermYears] = useState(30);
  const [includePrincipal, setIncludePrincipal] = useState(() => {
    try { return localStorage.getItem(LS_PRINCIPAL) !== "false"; } catch { return true; }
  });
  const [includeAppreciation, setIncludeAppreciation] = useState(() => {
    try { return localStorage.getItem(LS_INCLUDE_APPRECIATION) !== "false"; } catch { return true; }
  });
  const [fetchingRate, setFetchingRate] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("premium");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("");

  const neighborhoods = useMemo(() => getNeighborhoods(allListings), [allListings]);
  const [rentOverrides, setRentOverrides] = useState<Record<string, number>>(() => {
    try {
      const v = localStorage.getItem(LS_RENT_OVERRIDES);
      return v ? JSON.parse(v) : {};
    } catch { return {}; }
  });
  const [holdYears, setHoldYears] = useState(() => readLs(LS_HOLD_YEARS, 10));
  const [buyerClosingPct, setBuyerClosingPct] = useState(() => readLs(LS_BUYER_CLOSING, 2.5));
  const [sellerCostPct, setSellerCostPct] = useState(() => readLs(LS_SELLER_COST, 6));
  const [rentInflationPct, setRentInflationPct] = useState(() => readLs(LS_RENT_INFLATION, 3));
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);

  // Sync selected listing to URL for deep linking
  useEffect(() => {
    if (selectedId) {
      window.history.replaceState(null, "", `#finance?id=${encodeURIComponent(selectedId)}`);
    }
  }, [selectedId]);

  useEffect(() => { try { localStorage.setItem(LS_DOWN, String(downPct)); } catch {} }, [downPct]);
  useEffect(() => { try { localStorage.setItem(LS_RATE, String(ratePct)); } catch {} }, [ratePct]);
  useEffect(() => { try { localStorage.setItem(LS_OPP,  String(oppReturnPct)); } catch {} }, [oppReturnPct]);
  useEffect(() => { try { localStorage.setItem(LS_TAX_RATE, String(taxRatePct)); } catch {} }, [taxRatePct]);
  useEffect(() => { try { localStorage.setItem(LS_APPRECIATION, String(appreciationPct)); } catch {} }, [appreciationPct]);
  useEffect(() => { try { localStorage.setItem(LS_SALT_HEADROOM, String(saltHeadroom)); } catch {} }, [saltHeadroom]);
  useEffect(() => { try { localStorage.setItem(LS_PRINCIPAL, String(includePrincipal)); } catch {} }, [includePrincipal]);
  useEffect(() => { try { localStorage.setItem(LS_INCLUDE_APPRECIATION, String(includeAppreciation)); } catch {} }, [includeAppreciation]);
  useEffect(() => { try { localStorage.setItem(LS_RENT_OVERRIDES, JSON.stringify(rentOverrides)); } catch {} }, [rentOverrides]);
  useEffect(() => { try { localStorage.setItem(LS_HOLD_YEARS, String(holdYears)); } catch {} }, [holdYears]);
  useEffect(() => { try { localStorage.setItem(LS_BUYER_CLOSING, String(buyerClosingPct)); } catch {} }, [buyerClosingPct]);
  useEffect(() => { try { localStorage.setItem(LS_SELLER_COST, String(sellerCostPct)); } catch {} }, [sellerCostPct]);
  useEffect(() => { try { localStorage.setItem(LS_RENT_INFLATION, String(rentInflationPct)); } catch {} }, [rentInflationPct]);

  // Fetch live 30-yr mortgage rate from FRED
  useEffect(() => {
    let cancelled = false;
    setFetchingRate(true);
    fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US")
      .then((r) => r.text())
      .then((text) => {
        if (cancelled) return;
        const lines = text.trim().split("\n").filter((l) => l && !l.startsWith("DATE"));
        const last = lines[lines.length - 1];
        if (last) {
          const val = parseFloat(last.split(",")[1]);
          if (!isNaN(val) && val > 0) setRatePct(val);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFetchingRate(false); });
    return () => { cancelled = true; };
  }, []);

  const params = useMemo(
    () => ({ downPaymentPct: downPct / 100, annualRatePct: ratePct, termYears, opportunityReturnPct: oppReturnPct, includePrincipal, marginalTaxRatePct: taxRatePct, appreciationRatePct: includeAppreciation ? appreciationPct : 0, saltHeadroomAnnual: saltHeadroom * 1000, buyerClosingCostPct: buyerClosingPct }),
    [downPct, ratePct, termYears, oppReturnPct, includePrincipal, taxRatePct, appreciationPct, includeAppreciation, saltHeadroom, buyerClosingPct]
  );

  const listingsWithResults = useMemo(() => {
    return allListings.map((l) => ({
      listing: l,
      result: calcBuyVsRent(l, params, rentOverrides[l.id]),
    }));
  }, [allListings, params, rentOverrides]);

  const sorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = listingsWithResults.filter(({ listing: l }) => {
      if (selectedNeighborhood && l.location !== selectedNeighborhood) return false;
      if (q && !l.address.toLowerCase().includes(q) && !l.city.toLowerCase().includes(q) && !l.location.toLowerCase().includes(q)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "price":   return a.listing.price - b.listing.price;
        case "capRate": return b.listing.capRate - a.listing.capRate;
        case "ppsf": {
          const pa = a.listing.pricePerSqft ?? Infinity;
          const pb = b.listing.pricePerSqft ?? Infinity;
          return pa - pb;
        }
        case "cost":    return a.result.effectiveMonthlyOwnershipCost - b.result.effectiveMonthlyOwnershipCost;
        case "coc":     return b.result.cashOnCashReturnPct - a.result.cashOnCashReturnPct;
        case "premium":
        default:        return a.result.monthlyBuyPremium - b.result.monthlyBuyPremium;
      }
    });
  }, [listingsWithResults, sortKey, searchQuery, selectedNeighborhood]);

  // Keep selection valid; fall back to first item only if current selection is gone
  useEffect(() => {
    if (sorted.length === 0) return;
    const ids = new Set(sorted.map((x) => x.listing.id));
    setSelectedId((prev) => (prev && ids.has(prev) ? prev : sorted[0].listing.id));
  }, [sorted]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEntry = sorted.find((x) => x.listing.id === selectedId) ?? sorted[0];

  function calcBreakevenDown() {
    if (!selectedEntry) return;
    const { listing } = selectedEntry;
    const { capRateBreakdown: b, price } = listing;

    // Fixed monthly costs that don't depend on down payment
    const fixedCosts = b.propertyTax / 12 + b.insurance / 12 + b.annualHoa / 12 + b.maintenance / 12;

    // PI factor per dollar of loan (respects includePrincipal toggle)
    const r = ratePct / 12 / 100;
    const n = termYears * 12;
    let k: number;
    if (r === 0) {
      k = n > 0 ? 1 / n : 0;
    } else {
      const factor = Math.pow(1 + r, n);
      k = includePrincipal ? (r * factor) / (factor - 1) : r;
    }

    if (k === 0) return; // can't compute

    const rent = rentOverrides[listing.id] ?? b.monthlyRent;
    // Solve for cash-flow breakeven: rent = PI + fixed costs
    // i.e. rental income exactly covers all monthly ownership expenses
    // D = 1 - (rent - fixedCosts) / (price * k)
    const D = (1 - (rent - fixedCosts) / (price * k)) * 100;
    setDownPct(Math.round(Math.min(100, Math.max(0, D)) * 10) / 10);
  }

  function setRentOverride(id: string, rent: number | null) {
    setRentOverrides((prev) => {
      const next = { ...prev };
      if (rent === null) delete next[id]; else next[id] = rent;
      return next;
    });
  }

  return (
    <div className="fp-page">
      {/* ── Header ── */}
      <div className="fp-header">
        <div className="fp-header-top">
          <div className="fp-header-center">
            <h2>Finance — Buy vs Rent</h2>
          </div>
          <div className="fp-inputs">
            <div className="fp-input-group">
              <label>Down</label>
              <NumInput value={downPct} onChange={setDownPct} min={0} max={100} step={1} />
              <span>%</span>
              <button
                className="fp-term-btn fp-breakeven-btn"
                onClick={calcBreakevenDown}
                title="Set down payment so rental income covers all monthly costs: P&amp;I + property tax + insurance + HOA + maintenance (cash-flow breakeven)"
              >= rent</button>
            </div>
            <div className="fp-input-group">
              <label>Rate</label>
              <NumInput value={ratePct} onChange={setRatePct} min={0} max={20} step={0.01} width={62} />
              <span>%</span>
              {fetchingRate && <span className="fp-rate-spinner">live…</span>}
            </div>
            <div className="fp-input-group">
              <label>Opp. return</label>
              <NumInput value={oppReturnPct} onChange={setOppReturnPct} min={0} max={30} step={0.5} />
              <span>%</span>
            </div>
            <div className="fp-input-group">
              <label>Tax rate</label>
              <NumInput value={taxRatePct} onChange={setTaxRatePct} min={0} max={60} step={1} />
              <span>%</span>
            </div>
            <div className="fp-input-group">
              <label>Appreciation</label>
              <NumInput value={appreciationPct} onChange={setAppreciationPct} min={0} max={20} step={0.5} />
              <span>%/yr</span>
            </div>
            <div className="fp-input-group">
              <label>SALT headroom</label>
              <NumInput value={saltHeadroom} onChange={setSaltHeadroom} min={0} max={40} step={1} width={44} />
              <span>k</span>
            </div>
            <div className="fp-input-group">
              <div className="fp-term-group">
                <button
                  className={`fp-term-btn ${termYears === 15 ? "active" : ""}`}
                  onClick={() => setTermYears(15)}
                >15yr</button>
                <button
                  className={`fp-term-btn ${termYears === 30 ? "active" : ""}`}
                  onClick={() => setTermYears(30)}
                >30yr</button>
              </div>
            </div>
            <div className="fp-input-group">
              <button
                className={`fp-term-btn ${includePrincipal ? "active" : ""}`}
                onClick={() => setIncludePrincipal((v) => !v)}
                title="Principal repays your loan balance (equity). Toggle to see true cash cost."
              >
                {includePrincipal ? "Principal: on" : "Principal: off"}
              </button>
            </div>
            <div className="fp-input-group">
              <button
                className={`fp-term-btn ${includeAppreciation ? "active" : ""}`}
                onClick={() => setIncludeAppreciation((v) => !v)}
                title="Toggle whether property appreciation reduces your effective monthly cost."
              >
                {includeAppreciation ? "Appreciation: on" : "Appreciation: off"}
              </button>
            </div>
          </div>
        </div>

        {neighborhoods.length > 1 && (
          <div className="fp-sort-row">
            <span className="fp-sort-label">Hood:</span>
            <select
              className="fp-filter-select"
              value={selectedNeighborhood}
              onChange={(e) => setSelectedNeighborhood(e.target.value)}
            >
              <option value="">All neighborhoods</option>
              {neighborhoods.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        )}
        <div className="fp-sort-row">
          <input
            className="fp-search"
            type="text"
            placeholder="Search address or neighborhood…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="fp-sort-label">Sort:</span>
          {(
            [
              ["premium", "Buy Premium"],
              ["cost", "Monthly Cost"],
              ["coc", "CoC Return"],
              ["price", "Price"],
              ["capRate", "Cap Rate"],
              ["ppsf", "$/sqft"],
            ] as [SortKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              className={`fp-sort-chip ${sortKey === key ? "active" : ""}`}
              onClick={() => setSortKey(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body: list + detail ── */}
      <div className="fp-body">
        <div className="fp-list-panel">
          {sorted.map(({ listing, result }) => (
            <ListItem
              key={listing.id}
              listing={listing}
              result={result}
              selected={listing.id === selectedId}
              onClick={() => setSelectedId(listing.id)}
            />
          ))}
        </div>

        <div className="fp-detail-panel">
          {selectedEntry ? (
            <DetailPanel
              listing={selectedEntry.listing}
              result={selectedEntry.result}
              downPct={downPct}
              ratePct={ratePct}
              termYears={termYears}
              oppReturnPct={oppReturnPct}
              taxRatePct={taxRatePct}
              appreciationPct={appreciationPct}
              saltHeadroom={saltHeadroom}
              includePrincipal={includePrincipal}
              rentOverride={rentOverrides[selectedEntry.listing.id] ?? null}
              onSetRentOverride={(rent) => setRentOverride(selectedEntry.listing.id, rent)}
              holdYears={holdYears}
              setHoldYears={setHoldYears}
              buyerClosingPct={buyerClosingPct}
              setBuyerClosingPct={setBuyerClosingPct}
              sellerCostPct={sellerCostPct}
              setSellerCostPct={setSellerCostPct}
              rentInflationPct={rentInflationPct}
              setRentInflationPct={setRentInflationPct}
            />
          ) : (
            <div className="fp-empty">Select a property.</div>
          )}
        </div>
      </div>
    </div>
  );
}
