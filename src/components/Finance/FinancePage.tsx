import { useState, useEffect, useMemo } from "react";
import type { Listing, VisitRecord } from "../../types";
import { calcBuyVsRent, type BuyVsRentResult } from "../../utils/mortgageCalc";
import { formatPrice, formatBedsBaths } from "../../utils/formatters";
import "./FinancePage.css";

interface FinancePageProps {
  allListings: Listing[];
  visits: Record<string, VisitRecord>;
  priorityIds: Set<string>;
  hiddenIds: Set<string>;
  initialSelectedId?: string | null;
  onBack: () => void;
}

type SortKey = "price" | "cost" | "premium" | "capRate" | "ppsf";

const LS_DOWN = "finance-down-pct";
const LS_RATE = "finance-rate";
const LS_OPP  = "finance-opp-return";

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

function fmtDollarCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return fmtDollar(n);
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
  oppReturnPct: number;
}

function DetailPanel({ listing, result, downPct, oppReturnPct }: DetailProps) {
  const thumbSrc = `/thumbnails/${listing.id}.jpg`;
  const accent = accentClass(result.monthlyBuyPremium, listing.capRate);

  return (
    <div className={`fp-detail ${accent}`}>
      <div className="fp-detail-hero">
        <img className="fp-detail-thumb" src={thumbSrc} alt="" />
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
          <span className="fp-bd-label">P&amp;I / mo</span>
          <span className="fp-bd-val">{fmtMo(result.monthlyPI)}</span>
        </div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Property tax</span>
          <span className="fp-bd-val">{fmtMo(result.monthlyPropertyTax)}</span>
        </div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Insurance</span>
          <span className="fp-bd-val">{fmtMo(result.monthlyInsurance)}</span>
        </div>
        {result.monthlyHOA > 0 && (
          <div className="fp-bd-row">
            <span className="fp-bd-label">HOA</span>
            <span className="fp-bd-val">{fmtMo(result.monthlyHOA)}</span>
          </div>
        )}
        <div className="fp-bd-row">
          <span className="fp-bd-label">Maintenance</span>
          <span className="fp-bd-val">{fmtMo(result.monthlyMaintenance)}</span>
        </div>
        <hr className="fp-divider" />
        <div className="fp-bd-row total">
          <span className="fp-bd-label">Total own cost</span>
          <span className="fp-bd-val">{fmtMo(result.totalMonthlyOwnershipCost)}</span>
        </div>
        <div className="fp-bd-row muted">
          <span className="fp-bd-label">
            + Opp. cost
            <span className="fp-opp-formula">
              {fmtDollarCompact(result.downPayment)} × {oppReturnPct}% ÷ 12
            </span>
          </span>
          <span className="fp-bd-val">{fmtMo(result.opportunityCostMonthly)}</span>
        </div>
        <div className="fp-bd-row effective">
          <span className="fp-bd-label">Effective cost</span>
          <span className="fp-bd-val">{fmtMo(result.effectiveMonthlyOwnershipCost)}</span>
        </div>
        <div className="fp-bd-row">
          <span className="fp-bd-label">Est. rent</span>
          <span className="fp-bd-val">{fmtMo(result.estimatedMonthlyRent)}</span>
        </div>
        <hr className="fp-divider" />
        <div className={`fp-bd-row ${premiumClass(result.monthlyBuyPremium)}`}>
          <span className="fp-bd-label">Buy premium</span>
          <span className="fp-bd-val fp-bd-val--lg">{premiumLabel(result.monthlyBuyPremium)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export function FinancePage({ allListings, initialSelectedId, onBack }: FinancePageProps) {
  const [downPct, setDownPct] = useState(() => readLs(LS_DOWN, 20));
  const [ratePct, setRatePct] = useState(() => readLs(LS_RATE, 6.75));
  const [oppReturnPct, setOppReturnPct] = useState(() => readLs(LS_OPP, 7));
  const [termYears, setTermYears] = useState(30);
  const [fetchingRate, setFetchingRate] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("premium");
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);

  useEffect(() => { try { localStorage.setItem(LS_DOWN, String(downPct)); } catch {} }, [downPct]);
  useEffect(() => { try { localStorage.setItem(LS_RATE, String(ratePct)); } catch {} }, [ratePct]);
  useEffect(() => { try { localStorage.setItem(LS_OPP,  String(oppReturnPct)); } catch {} }, [oppReturnPct]);

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
    () => ({ downPaymentPct: downPct / 100, annualRatePct: ratePct, termYears, opportunityReturnPct: oppReturnPct }),
    [downPct, ratePct, termYears, oppReturnPct]
  );

  const listingsWithResults = useMemo(() => {
    return allListings.map((l) => ({ listing: l, result: calcBuyVsRent(l, params) }));
  }, [allListings, params]);

  const sorted = useMemo(() => {
    return [...listingsWithResults].sort((a, b) => {
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
  }, [listingsWithResults, sortKey]);

  // Keep selection valid; fall back to first item only if current selection is gone
  useEffect(() => {
    if (sorted.length === 0) return;
    const ids = new Set(sorted.map((x) => x.listing.id));
    setSelectedId((prev) => (prev && ids.has(prev) ? prev : sorted[0].listing.id));
  }, [sorted]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedEntry = sorted.find((x) => x.listing.id === selectedId) ?? sorted[0];

  return (
    <div className="fp-page">
      {/* ── Header ── */}
      <div className="fp-header">
        <div className="fp-header-top">
          <button className="fp-back" onClick={onBack}>← Back</button>
          <div className="fp-header-center">
            <h2>Finance — Buy vs Rent</h2>
          </div>
          <div className="fp-inputs">
            <div className="fp-input-group">
              <label>Down</label>
              <NumInput value={downPct} onChange={setDownPct} min={0} max={100} step={1} />
              <span>%</span>
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
          </div>
        </div>

        <div className="fp-sort-row">
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
              oppReturnPct={oppReturnPct}
            />
          ) : (
            <div className="fp-empty">Select a property.</div>
          )}
        </div>
      </div>
    </div>
  );
}
