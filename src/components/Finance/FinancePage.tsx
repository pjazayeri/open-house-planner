import { useState, useEffect, useMemo, useRef } from "react";
import type { Listing, VisitRecord, MapZone } from "../../types";
import { calcBuyVsRent, calcTimeSeries, type BuyVsRentResult, type TimeSeriesPoint } from "../../utils/mortgageCalc";
import { recalcCapRateWithRent } from "../../utils/capRate";
import { pointInPolygon } from "../../utils/geometry";
import { formatPrice, formatBedsBaths } from "../../utils/formatters";
import { navigationUrl } from "../../utils/mapsUrl";
import { totalOwnCostTooltip, effectiveCostTooltip, netCostTooltip } from "../../utils/financeTooltips";
import { matchesListingSearch } from "../../utils/listingSearch";
import { thumbnailUrl } from "../../utils/thumbnailUrl";
import "./FinancePage.css";
import { useRentEstimates, type RentEstimate } from "../../hooks/useRentEstimates";

interface FinancePageProps {
  allListings: Listing[];
  visits: Record<string, VisitRecord>;
  priorityIds: Set<string>;
  hiddenIds: Set<string>;
  initialSelectedId?: string | null;
  togglePriority: (id: string) => void;
  zones: MapZone[];
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

// Short money label: "$85k", "$1.25M", "−$12k". Trims trailing zeros so a
// nice-step axis tick like 1.25M doesn't round to a misleading "$1.3M".
function fmtK(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${parseFloat((abs / 1_000_000).toFixed(2))}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

// Axis step of 1 / 2 / 2.5 / 5 × 10^k so gridlines land on round dollars.
function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

// Width of a block element, kept current via ResizeObserver, so the chart
// can render at real pixel size instead of scaling a fixed viewBox.
function useMeasuredWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// Interpolated crossing where buy first drops below rent (the visual line
// intersection), or null if buying never catches up within the hold.
// Mirrored in mortgageCalc.test.ts — keep the two in sync.
function findBreakEven(points: TimeSeriesPoint[]): { year: number; value: number } | null {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dPrev = prev.netBuyCost - prev.cumulativeRentCost;
    const dCurr = curr.netBuyCost - curr.cumulativeRentCost;
    if (dPrev > 0 && dCurr <= 0) {
      const t = dPrev / (dPrev - dCurr);
      return {
        year: prev.year + (curr.year - prev.year) * t,
        value: prev.netBuyCost + (curr.netBuyCost - prev.netBuyCost) * t,
      };
    }
  }
  return null;
}

// ── Time series chart ─────────────────────────────────────────────
function TimeChart({ points }: { points: TimeSeriesPoint[] }) {
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [wrapRef, wrapW] = useMeasuredWidth();
  const svgRef = useRef<SVGSVGElement>(null);

  if (points.length < 2) return null;

  // Render at the container's real width so labels stay 11px on wide panels
  // instead of being scaled up 3× with a fixed viewBox.
  const W = Math.max(320, Math.round(wrapW) || 460), H = 260;
  const PAD_L = 62, PAD_R = 18, PAD_T = 16, PAD_B = 30;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const maxYear = points[points.length - 1].year;
  const allVals = points.flatMap((p) => [p.netBuyCost, p.cumulativeRentCost]);
  const rawMin = Math.min(0, ...allVals);
  const rawMax = Math.max(0, ...allVals);
  const step = niceStep(rawMax - rawMin || 1, 4);
  const minV = Math.floor(rawMin / step) * step;
  const maxV = Math.max(Math.ceil(rawMax / step) * step, minV + step);
  const range = maxV - minV;
  const ticks: number[] = [];
  for (let v = minV; v <= maxV + step / 2; v += step) ticks.push(v);

  const xOf = (year: number) => PAD_L + (year / (maxYear || 1)) * chartW;
  const yOf = (v: number) => PAD_T + chartH - ((v - minV) / range) * chartH;

  const buyPts = points.map((p) => `${xOf(p.year)},${yOf(p.netBuyCost)}`).join(" ");
  const rentPts = points.map((p) => `${xOf(p.year)},${yOf(p.cumulativeRentCost)}`).join(" ");

  // Band between the two lines, coloured by who's ahead. Each yearly segment
  // is split at the interpolated crossing so the colour flips exactly there.
  const bands: { pts: string; buyAhead: boolean }[] = [];
  const quad = (y0: number, b0: number, r0: number, y1: number, b1: number, r1: number, buyAhead: boolean) =>
    bands.push({ pts: `${xOf(y0)},${yOf(b0)} ${xOf(y1)},${yOf(b1)} ${xOf(y1)},${yOf(r1)} ${xOf(y0)},${yOf(r0)}`, buyAhead });
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1], c = points[i];
    const dP = p.netBuyCost - p.cumulativeRentCost;
    const dC = c.netBuyCost - c.cumulativeRentCost;
    if (dP * dC < 0) {
      const t = dP / (dP - dC);
      const ym = p.year + (c.year - p.year) * t;
      const bm = p.netBuyCost + (c.netBuyCost - p.netBuyCost) * t;
      const rm = p.cumulativeRentCost + (c.cumulativeRentCost - p.cumulativeRentCost) * t;
      quad(p.year, p.netBuyCost, p.cumulativeRentCost, ym, bm, rm, dP < 0);
      quad(ym, bm, rm, c.year, c.netBuyCost, c.cumulativeRentCost, dC < 0);
    } else {
      quad(p.year, p.netBuyCost, p.cumulativeRentCost, c.year, c.netBuyCost, c.cumulativeRentCost, dP + dC < 0);
    }
  }

  const breakEven = findBreakEven(points);

  // Year the mortgage is paid off (hold ≥ term) — P&I stops here, so the
  // buy line's slope changes; label it so the kink isn't a mystery.
  const payoffYear = (() => {
    for (let i = 1; i < points.length; i++) {
      if (points[i - 1].remainingBalance > 1 && points[i].remainingBalance <= 1) return points[i].year;
    }
    return null;
  })();

  // X labels: every 5 years plus both endpoints; drop a 5-multiple that
  // would collide with the final-year label.
  const xLabels = points
    .map((p) => p.year)
    .filter((y) => y === 0 || y === maxYear || (y % 5 === 0 && maxYear - y >= 2));

  const hoverPoint = hoverYear !== null ? (points.find((p) => p.year === hoverYear) ?? null) : null;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const yearFrac = ((svgX - PAD_L) / chartW) * maxYear;
    setHoverYear(Math.round(Math.max(0, Math.min(maxYear, yearFrac))));
  }

  const TT_W = 172, TT_H = 66, TT_PAD = 8, LINE = 14;

  return (
    <div className="fp-time-chart-wrap" ref={wrapRef}>
      <div className="fp-time-legend">
        <span><i style={{ background: "#a78bfa" }} />Buy net cost (if sold that year)</span>
        <span><i style={{ background: "#f59e0b" }} />Rent paid to date</span>
        <span><i className="area" style={{ background: "rgba(34,197,94,0.35)" }} />Buy ahead</span>
        <span><i className="area" style={{ background: "rgba(239,68,68,0.35)" }} />Rent ahead</span>
        {breakEven !== null && <span><i className="dot" style={{ background: "#22c55e" }} />Break-even</span>}
        {payoffYear !== null && <span><i className="dash" />Loan paid off</span>}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="fp-time-chart"
        aria-label="Buy vs Rent over time"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverYear(null)}
        style={{ cursor: "crosshair" }}
      >
        {/* Gridlines + Y ticks */}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke={v === 0 ? "#475569" : "#1e293b"} strokeWidth={1} />
            <text x={PAD_L - 8} y={yOf(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">{fmtK(v)}</text>
          </g>
        ))}
        {/* Who's-ahead band */}
        {bands.map((b, i) => (
          <polygon key={i} points={b.pts} fill={b.buyAhead ? "#22c55e" : "#ef4444"} fillOpacity={0.12} stroke="none" />
        ))}
        {/* Loan payoff marker */}
        {payoffYear !== null && (
          <g>
            <line x1={xOf(payoffYear)} y1={PAD_T} x2={xOf(payoffYear)} y2={H - PAD_B} stroke="#64748b" strokeWidth={1} strokeDasharray="4 3" />
            <text x={xOf(payoffYear) - 5} y={PAD_T + 11} textAnchor="end" fontSize={10} fill="#94a3b8">loan paid off</text>
          </g>
        )}
        {/* X-axis labels */}
        {xLabels.map((y) => (
          <text key={y} x={xOf(y)} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748b">yr {y}</text>
        ))}
        {/* Axes */}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#475569" strokeWidth={1} />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#475569" strokeWidth={1} />
        {/* Rent line (amber) */}
        <polyline points={rentPts} fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinejoin="round" />
        {/* Buy net cost line (purple) */}
        <polyline points={buyPts} fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinejoin="round" />
        {/* Break-even marker — at the interpolated line intersection */}
        {breakEven !== null && (() => {
          const bx = xOf(breakEven.year), by = yOf(breakEven.value);
          const flip = bx > W - PAD_R - 120;
          return (
            <g>
              <circle cx={bx} cy={by} r={4.5} fill="#22c55e" stroke="#0a1628" strokeWidth={1.5} />
              <text x={flip ? bx - 8 : bx + 8} y={by - 8} textAnchor={flip ? "end" : "start"} fontSize={11} fontWeight={600} fill="#22c55e">
                break-even yr {breakEven.year.toFixed(1)}
              </text>
            </g>
          );
        })()}
        {/* Hover crosshair + tooltip */}
        {hoverPoint && (() => {
          const cx = xOf(hoverPoint.year);
          const diff = hoverPoint.cumulativeRentCost - hoverPoint.netBuyCost;
          const ttX = cx + 10 + TT_W > W - PAD_R ? cx - 10 - TT_W : cx + 10;
          const ttY = PAD_T + 4;
          return (
            <g pointerEvents="none">
              <line x1={cx} y1={PAD_T} x2={cx} y2={H - PAD_B} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={cx} cy={yOf(hoverPoint.netBuyCost)} r={4} fill="#a78bfa" stroke="#0a1628" strokeWidth={1.5} />
              <circle cx={cx} cy={yOf(hoverPoint.cumulativeRentCost)} r={4} fill="#f59e0b" stroke="#0a1628" strokeWidth={1.5} />
              <rect x={ttX} y={ttY} width={TT_W} height={TT_H} rx={5} fill="#1e293b" stroke="#334155" strokeWidth={1} />
              <text x={ttX + TT_PAD} y={ttY + TT_PAD + 10} fontSize={11} fill="#cbd5e1" fontWeight={600}>
                {hoverPoint.year === 0 ? "At closing" : `Year ${hoverPoint.year}`}
              </text>
              <text x={ttX + TT_PAD} y={ttY + TT_PAD + 10 + LINE} fontSize={11} fill="#a78bfa">Buy net: {fmtK(hoverPoint.netBuyCost)}</text>
              <text x={ttX + TT_PAD} y={ttY + TT_PAD + 10 + LINE * 2} fontSize={11} fill="#f59e0b">Rent: {fmtK(hoverPoint.cumulativeRentCost)}</text>
              <text x={ttX + TT_PAD} y={ttY + TT_PAD + 10 + LINE * 3} fontSize={11} fontWeight={600} fill={diff >= 0 ? "#22c55e" : "#ef4444"}>
                {diff >= 0 ? `Buy ahead by ${fmtK(diff)}` : `Rent ahead by ${fmtK(-diff)}`}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ── Compact list item ────────────────────────────────────────────
interface ListItemProps {
  listing: Listing;
  result: BuyVsRentResult;
  effectiveCapRate: number;
  selected: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}

function cocClass(coc: number): string {
  if (coc >= 4) return "coc-good";
  if (coc >= 0) return "coc-ok";
  return "coc-bad";
}

function ListItem({ listing, result, effectiveCapRate, selected, isFavorite, onToggleFavorite, onClick }: ListItemProps) {
  const accent = accentClass(result.monthlyBuyPremium, effectiveCapRate);
  const coc = result.cashOnCashReturnPct;
  return (
    <div className={`fp-list-item ${accent} ${selected ? "selected" : ""}`} onClick={onClick}>
      <div className="fp-li-main">
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
      </div>
      <button
        className={`fp-star-btn${isFavorite ? " fp-star-btn--active" : ""}`}
        title={isFavorite ? "Remove from finance favorites" : "Add to finance favorites"}
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
      >
        {isFavorite ? "★" : "☆"}
      </button>
    </div>
  );
}

// ── Detail panel ─────────────────────────────────────────────────
interface DetailProps {
  listing: Listing;
  result: BuyVsRentResult;
  effectiveCapRate: number;
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
  rentEstimate: RentEstimate | null;
  fetchingEstimate: boolean;
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

function DetailPanel({ listing, result, effectiveCapRate, downPct, ratePct, termYears, oppReturnPct, taxRatePct, appreciationPct, saltHeadroom, includePrincipal, rentOverride, onSetRentOverride, rentEstimate, fetchingEstimate, holdYears, setHoldYears, buyerClosingPct, setBuyerClosingPct, sellerCostPct, setSellerCostPct, rentInflationPct, setRentInflationPct }: DetailProps) {
  const [thumbError, setThumbError] = useState(false);
  const [thumbRetry, setThumbRetry] = useState(0);
  const thumbSrc = thumbnailUrl(listing.id, listing.url, thumbRetry);

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
  const accent = accentClass(result.monthlyBuyPremium, effectiveCapRate);
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

  // ── Totals tooltips: itemized component breakdown ──────────────
  const tipTotalOwn = totalOwnCostTooltip(result, includePrincipal);
  const tipEffective = effectiveCostTooltip(result, oppReturnPct);
  const tipNetCost = netCostTooltip(result);

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
          <div className="fp-detail-thumb fp-detail-thumb-ph">
            🏠
            <button
              className="thumb-retry-btn"
              title="Retry loading image"
              onClick={() => { setThumbError(false); setThumbRetry(r => r + 1); }}
            >↻</button>
          </div>
        ) : (
          <img className="fp-detail-thumb" src={thumbSrc} alt="" onError={() => setThumbError(true)} />
        )}
        <div className="fp-detail-meta">
          <a
            className="fp-detail-address fp-detail-address--link"
            href={navigationUrl(listing.lat, listing.lng, listing.address, listing.city)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open directions in Maps"
          >
            {listing.address}
          </a>
          <div className="fp-detail-sub">
            {formatPrice(listing.price)}
            {listing.sqft ? ` · ${listing.sqft.toLocaleString()} sqft` : ""}
            {` · ${formatBedsBaths(listing.beds, listing.baths)}`}
            {listing.pricePerSqft ? ` · $${Math.round(listing.pricePerSqft).toLocaleString()}/sqft` : ""}
          </div>
          <div className="fp-detail-badges">
            <span className={`fp-cap-badge ${capBadgeClass(effectiveCapRate)}`}>
              {effectiveCapRate.toFixed(2)}% cap
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
        <div className="fp-bd-section">Loan</div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Down payment</span>
          <span className="fp-bd-val">{fmtDollar(result.downPayment)} ({downPct}%)</span>
        </div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Loan amount</span>
          <span className="fp-bd-val">{fmtDollar(result.loanAmount)}</span>
        </div>

        <div className="fp-bd-section">Monthly cash costs</div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Interest</span>
          <Tip tip={tipInterest}>{fmtMo(result.monthlyInterest)}</Tip>
        </div>
        <div className={`fp-bd-row${includePrincipal ? "" : " muted"}`}>
          <span className="fp-bd-label">
            Principal
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
        <div className="fp-bd-row total">
          <span className="fp-bd-label">Total own cost</span>
          <Tip tip={tipTotalOwn}>{fmtMo(result.totalMonthlyOwnershipCost)}</Tip>
        </div>

        <div className="fp-bd-section">Plus opportunity cost</div>
        <div className="fp-bd-row soft">
          <span className="fp-bd-label">+ Opportunity cost</span>
          <Tip tip={tipOpp}>{fmtMo(result.opportunityCostMonthly)}</Tip>
        </div>
        <div className="fp-bd-row effective">
          <span className="fp-bd-label">Effective cost</span>
          <Tip tip={tipEffective}>{fmtMo(result.effectiveMonthlyOwnershipCost)}</Tip>
        </div>

        {(result.monthlyTaxSavings > 0 || result.monthlyPropertyTaxSavings > 0 || result.monthlyAppreciation > 0) && (
          <div className="fp-bd-section">Less tax &amp; equity offsets</div>
        )}
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
            <Tip tip={tipNetCost}>{fmtMo(result.netMonthlyOwnershipCost)}</Tip>
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
        {(rentEstimate || fetchingEstimate) && (
          <div className="fp-bd-row fp-bd-row--rentcast">
            <span className="fp-bd-label fp-rentcast-label">
              RentCast est.
            </span>
            {fetchingEstimate && !rentEstimate ? (
              <span className="fp-rentcast-loading">fetching…</span>
            ) : rentEstimate ? (
              <div className="fp-rentcast-val">
                <span>{fmtMo(rentEstimate.rent)}</span>
                <span className="fp-rentcast-range">
                  {" "}({fmtDollar(rentEstimate.low)}–{fmtDollar(rentEstimate.high)})
                </span>
                {rentEstimate.comparables > 0 && (
                  <span className="fp-rentcast-comps"> · {rentEstimate.comparables} comps</span>
                )}
                <button
                  className="fp-rentcast-use"
                  onClick={() => onSetRentOverride(rentEstimate.rent)}
                  title="Set rent override to this RentCast estimate"
                >
                  Use
                </button>
              </div>
            ) : null}
          </div>
        )}
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
              `Cumulative cost of buying vs renting, year by year.`,
              ``,
              `Purple — "Buy net cost"`,
              `  Total cash out (down + closing, P&I while the`,
              `  loan lasts, tax/insurance/HOA/maintenance,`,
              `  opportunity cost on the down payment, − tax`,
              `  savings) minus what you'd net by selling that`,
              `  year (value − balance − seller costs).`,
              `  Year 0 = the day you close: the net cost is`,
              `  just the round-trip transaction costs.`,
              ``,
              `Amber — "Rent"`,
              `  Cumulative rent paid (with annual inflation).`,
              ``,
              `Shading — green where buying is ahead, red`,
              `  where renting is ahead.`,
              ``,
              `Green dot — break-even year: where buying-`,
              `  then-selling first beats having rented.`,
              ``,
              `Dashed line — mortgage paid off (hold > term).`,
              `  P&I stops, so the buy line flattens.`,
              ``,
              `Seller costs reduce sale proceeds at every`,
              `year on the chart — the purple line always`,
              `assumes you sell at that point.`,
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
export function FinancePage({ allListings, initialSelectedId, priorityIds, togglePriority, zones }: FinancePageProps) {
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
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const drawnZones = useMemo(() => zones.filter((z) => z.polygon.length >= 3), [zones]);
  const selectedZone = useMemo(
    () => drawnZones.find((z) => z.id === selectedZoneId),
    [drawnZones, selectedZoneId]
  );
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
  const { fetchEstimate, getEstimate } = useRentEstimates();
  const [fetchingEstimate, setFetchingEstimate] = useState(false);

  // Auto-fetch RentCast estimate when selection changes
  useEffect(() => {
    if (!selectedId) return;
    const listing = allListings.find((l) => l.id === selectedId);
    if (!listing || getEstimate(selectedId)) return;
    let cancelled = false;
    setFetchingEstimate(true);
    fetchEstimate(listing).finally(() => { if (!cancelled) setFetchingEstimate(false); });
    return () => { cancelled = true; };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return allListings.map((l) => {
      const result = calcBuyVsRent(l, params, rentOverrides[l.id]);
      // Effective cap rate uses the user's rent override when present so the
      // badge tracks the rent input field. Falls back to listing.capRate.
      const effectiveCapRate = rentOverrides[l.id] !== undefined
        ? recalcCapRateWithRent(l.capRateBreakdown, rentOverrides[l.id], l.price)
        : l.capRate;
      return { listing: l, result, effectiveCapRate };
    });
  }, [allListings, params, rentOverrides]);

  const sorted = useMemo(() => {
    const filtered = listingsWithResults.filter(({ listing: l }) => {
      if (showFavoritesOnly && !priorityIds.has(l.id)) return false;
      if (selectedZone && !pointInPolygon(l.lat, l.lng, selectedZone.polygon)) return false;
      if (!matchesListingSearch(l, searchQuery)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "price":   return a.listing.price - b.listing.price;
        case "capRate": return b.effectiveCapRate - a.effectiveCapRate;
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
  }, [listingsWithResults, sortKey, searchQuery, selectedZone, showFavoritesOnly, priorityIds]);

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

        {drawnZones.length > 0 && (
          <div className="fp-sort-row">
            <span className="fp-sort-label">Zone:</span>
            <select
              className="fp-filter-select"
              value={selectedZoneId}
              onChange={(e) => setSelectedZoneId(e.target.value)}
            >
              <option value="">All zones</option>
              {drawnZones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="fp-sort-row">
          <input
            className="fp-search"
            type="text"
            placeholder="Search address, neighborhood, zip, MLS…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            className={`fp-sort-chip fp-favorites-toggle${showFavoritesOnly ? " active" : ""}`}
            onClick={() => setShowFavoritesOnly((v) => !v)}
            title="Show only favorited listings"
          >
            {showFavoritesOnly ? "★" : "☆"} Favorites{priorityIds.size > 0 ? ` (${priorityIds.size})` : ""}
          </button>
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
          {sorted.map(({ listing, result, effectiveCapRate }) => (
            <ListItem
              key={listing.id}
              listing={listing}
              result={result}
              effectiveCapRate={effectiveCapRate}
              selected={listing.id === selectedId}
              isFavorite={priorityIds.has(listing.id)}
              onToggleFavorite={() => togglePriority(listing.id)}
              onClick={() => setSelectedId(listing.id)}
            />
          ))}
        </div>

        <div className="fp-detail-panel">
          {selectedEntry ? (
            <DetailPanel
              listing={selectedEntry.listing}
              result={selectedEntry.result}
              effectiveCapRate={selectedEntry.effectiveCapRate}
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
              rentEstimate={getEstimate(selectedEntry.listing.id)}
              fetchingEstimate={fetchingEstimate}
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
