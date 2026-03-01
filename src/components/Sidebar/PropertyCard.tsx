import { useState } from "react";
import type { Listing } from "../../types";
import type { CapRateBreakdown } from "../../utils/capRate";
import { formatPrice, formatBedsBaths, formatTimeRange } from "../../utils/formatters";
import "./PropertyCard.css";

interface PropertyCardProps {
  listing: Listing;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

function fmtDollar(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(0) + "%";
}

function buildTooltipLines(b: CapRateBreakdown): string[] {
  const lines: string[] = [];

  // Rent section
  lines.push("RENT ESTIMATE");
  lines.push(`  ${fmtDollar(b.monthlyRent)}/mo gross`);
  lines.push(`  ${b.effectiveSqft.toLocaleString()} sqft${b.sqftImputed ? " (imputed)" : ""} × $${b.rentPsf.toFixed(2)}/sqft (${b.rentPsfSource})`);
  if (b.propertyTypeMultiplier !== 1.0) {
    lines.push(`  × ${b.propertyTypeMultiplier}x property type`);
  }
  if (b.units > 1) {
    lines.push(`  × ${b.units} units (est. from baths)`);
  }

  // Expenses section
  lines.push("");
  lines.push("ANNUAL EXPENSES");
  lines.push(`  Property tax   ${fmtDollar(b.propertyTax)}  (1.1% Prop 13)`);
  lines.push(`  Insurance      ${fmtDollar(b.insurance)}  (${b.insuranceLabel})`);
  lines.push(`  Vacancy        ${fmtDollar(b.vacancy)}  (5%)`);

  let maintDetail = `${fmtPct(b.maintenanceRate)} of rent`;
  if (b.hoaReductionLabel) maintDetail += ` ${b.hoaReductionLabel}`;
  lines.push(`  Maintenance    ${fmtDollar(b.maintenance)}  (${maintDetail})`);

  if (b.management > 0) {
    lines.push(`  Management     ${fmtDollar(b.management)}  (8%)`);
  }
  if (b.annualHoa > 0) {
    lines.push(`  HOA            ${fmtDollar(b.annualHoa)}  (${fmtDollar(b.annualHoa / 12)}/mo)`);
  }
  lines.push(`  Total          ${fmtDollar(b.totalExpenses)}`);

  // Bottom line
  lines.push("");
  lines.push(`NOI ${fmtDollar(b.noi)}  →  ${b.capRate.toFixed(1)}% cap rate`);

  return lines;
}

export function PropertyCard({
  listing,
  isSelected,
  isHovered,
  onSelect,
  onHover,
}: PropertyCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  const classes = [
    "property-card",
    isSelected ? "selected" : "",
    isHovered ? "hovered" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const b = listing.capRateBreakdown;
  const tooltipText = buildTooltipLines(b).join("\n");

  return (
    <div
      className={classes}
      id={`card-${listing.id}`}
      onClick={() => onSelect(listing.id)}
      onMouseEnter={() => onHover(listing.id)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="card-header">
        <span className="visit-badge">#{listing.visitOrder}</span>
        <span className="card-price">{formatPrice(listing.price)}</span>
        <span
          className={`card-cap-rate ${listing.capRate >= 3.5 ? "good" : listing.capRate >= 1.5 ? "ok" : "low"}`}
          title="Estimated cap rate"
        >
          {listing.capRate.toFixed(1)}% cap
        </span>
      </div>
      {!thumbError && (
        <img
          className="card-thumbnail"
          src={`${import.meta.env.BASE_URL}thumbnails/${listing.id}.jpg`}
          alt={listing.address}
          loading="lazy"
          onError={() => setThumbError(true)}
        />
      )}
      <div className="card-address">{listing.address}</div>
      <div className="card-details">
        <span>{formatBedsBaths(listing.beds, listing.baths)}</span>
        {listing.sqft && <span>&middot; {listing.sqft.toLocaleString()} sqft</span>}
        {listing.propertyType && <span>&middot; {listing.propertyType}</span>}
      </div>
      <div className="card-rent-row">
        <span
          className="card-rent"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={(e) => { e.stopPropagation(); setShowTooltip((v) => !v); }}
        >
          Est. rent {fmtDollar(b.monthlyRent)}/mo
          {b.sqftImputed && <span className="rent-imputed-flag">*</span>}
        </span>
        {listing.hoa !== null && listing.hoa > 0 && (
          <span className="card-hoa">{fmtDollar(listing.hoa)} HOA</span>
        )}
        {showTooltip && (
          <div className="rent-tooltip" role="tooltip">
            <pre>{tooltipText}</pre>
          </div>
        )}
      </div>
      <div className="card-meta">
        <span className="card-time">
          {formatTimeRange(listing.openHouseStart, listing.openHouseEnd)}
        </span>
        {listing.daysOnMarket !== null && (
          <span className="card-dom">{listing.daysOnMarket}d on market</span>
        )}
      </div>
      <a
        className="card-link"
        href={listing.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        View on Redfin
      </a>
    </div>
  );
}
