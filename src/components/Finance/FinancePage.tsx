import { useState, useEffect, useMemo } from "react";
import type { Listing, VisitRecord } from "../../types";
import { calcBuyVsRent, type BuyVsRentResult } from "../../utils/mortgageCalc";
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

type SortKey = "price" | "cost" | "premium" | "capRate" | "ppsf";

const LS_DOWN = "finance-down-pct";
const LS_RATE = "finance-rate";
const LS_OPP  = "finance-opp-return";
const LS_PRINCIPAL = "finance-include-principal";
const LS_RENT_OVERRIDES = "finance-rent-overrides";

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

// ── Compact list item ────────────────────────────────────────────
interface ListItemProps {
  listing: Listing;
  result: BuyVsRentResult;
  selected: boolean;
  onClick: () => void;
}

function ListItem({ listing, result, selected, onClick }: ListItemProps) {
  const accent = accentClass(result.monthlyBuyPremium, listing.capRate);
  return (
    <button
      className={`fp-list-item ${accent} ${selected ? "selected" : ""}`}
      onClick={onClick}
    >
      <div className="fp-li-address">{listing.address}</div>
      <div className="fp-li-meta">
        {formatPrice(listing.price)} · {formatBedsBaths(listing.beds, listing.baths)}
      </div>
      <div className={`fp-li-premium ${premiumClass(result.monthlyBuyPremium)}`}>
        {premiumLabel(result.monthlyBuyPremium)}
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
  includePrincipal: boolean;
  rentOverride: number | null;
  onSetRentOverride: (rent: number | null) => void;
}

function DetailPanel({ listing, result, downPct, ratePct, termYears, oppReturnPct, includePrincipal, rentOverride, onSetRentOverride }: DetailProps) {
  const [thumbError, setThumbError] = useState(false);
  const thumbSrc = `/api/thumbnail/${listing.id}`;
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

  const tipBuyPremium = [
    `Effective cost − Est. rent`,
    `${fmtDollar(result.effectiveMonthlyOwnershipCost)} − ${fmtDollar(result.estimatedMonthlyRent)}`,
    result.monthlyBuyPremium >= 0
      ? `Positive = buying costs more than renting`
      : `Negative = buying is cheaper than renting`,
  ].join("\n");

  return (
    <div className={`fp-detail ${accent}`}>
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
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export function FinancePage({ allListings, initialSelectedId }: FinancePageProps) {
  const [downPct, setDownPct] = useState(() => readLs(LS_DOWN, 20));
  const [ratePct, setRatePct] = useState(() => readLs(LS_RATE, 6.75));
  const [oppReturnPct, setOppReturnPct] = useState(() => readLs(LS_OPP, 7));
  const [termYears, setTermYears] = useState(30);
  const [includePrincipal, setIncludePrincipal] = useState(() => {
    try { return localStorage.getItem(LS_PRINCIPAL) !== "false"; } catch { return true; }
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
  useEffect(() => { try { localStorage.setItem(LS_PRINCIPAL, String(includePrincipal)); } catch {} }, [includePrincipal]);
  useEffect(() => { try { localStorage.setItem(LS_RENT_OVERRIDES, JSON.stringify(rentOverrides)); } catch {} }, [rentOverrides]);

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
    () => ({ downPaymentPct: downPct / 100, annualRatePct: ratePct, termYears, opportunityReturnPct: oppReturnPct, includePrincipal }),
    [downPct, ratePct, termYears, oppReturnPct, includePrincipal]
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
    // Solve: price*(1-D)*k + fixedCosts = rent  →  D = 1 - (rent - fixedCosts)/(price*k)
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
                title="Set down payment so total ownership cost equals estimated rent"
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
              includePrincipal={includePrincipal}
              rentOverride={rentOverrides[selectedEntry.listing.id] ?? null}
              onSetRentOverride={(rent) => setRentOverride(selectedEntry.listing.id, rent)}
            />
          ) : (
            <div className="fp-empty">Select a property.</div>
          )}
        </div>
      </div>
    </div>
  );
}
