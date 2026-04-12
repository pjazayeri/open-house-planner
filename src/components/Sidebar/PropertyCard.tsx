import { useState } from "react";
import type { Listing, VisitRecord } from "../../types";
import type { CapRateBreakdown } from "../../utils/capRate";
import type { ListingAmenities } from "../../utils/cloudSync";
import { formatPrice, formatBedsBaths, formatTimeRange } from "../../utils/formatters";
import "./PropertyCard.css";

interface PropertyCardProps {
  listing: Listing;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onHide: (id: string) => void;
  onSkipForDay?: () => void;
  isPriority: boolean;
  onTogglePriority: (id: string) => void;
  visit: VisitRecord | null;
  isNearby: boolean;
  onMarkVisited: (id: string) => void;
  onSetLiked: (id: string, liked: boolean | null) => void;
  onSetRating: (id: string, rating: number | null) => void;
  onToggleWantOffer: (id: string) => void;
  onSetNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  onClearVisit: (id: string) => void;
  onOpenFinance: (id: string) => void;
  amenity: ListingAmenities;
  onSetAmenity: (id: string, field: "parking" | "laundry", value: boolean | undefined) => void;
}

function fmtDollar(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(0) + "%";
}

function buildTooltipLines(b: CapRateBreakdown): string[] {
  const lines: string[] = [];

  lines.push("RENT ESTIMATE");
  lines.push(`  ${fmtDollar(b.monthlyRent)}/mo gross`);
  lines.push(`  ${b.effectiveSqft.toLocaleString()} sqft${b.sqftImputed ? " (imputed)" : ""} × $${b.rentPsf.toFixed(2)}/sqft (${b.rentPsfSource})`);
  if (b.propertyTypeMultiplier !== 1.0) {
    lines.push(`  × ${b.propertyTypeMultiplier}x property type`);
  }
  if (b.units > 1) {
    lines.push(`  × ${b.units} units (est. from baths)`);
  }

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

  lines.push("");
  lines.push(`NOI ${fmtDollar(b.noi)}  →  ${b.capRate.toFixed(1)}% cap rate`);

  return lines;
}

function fmtVisitTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function PropertyCard({
  listing,
  isSelected,
  isHovered,
  onSelect,
  onHover,
  onHide,
  onSkipForDay,
  isPriority,
  onTogglePriority,
  visit,
  isNearby,
  onMarkVisited,
  onSetLiked,
  onSetRating,
  onToggleWantOffer,
  onSetNoteField,
  onClearVisit,
  onOpenFinance,
  amenity,
  onSetAmenity,
}: PropertyCardProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [localPros, setLocalPros] = useState(visit?.pros ?? "");
  const [localCons, setLocalCons] = useState(visit?.cons ?? "");
  const [notesSaved, setNotesSaved] = useState(false);

  const classes = [
    "property-card",
    isSelected ? "selected" : "",
    isHovered ? "hovered" : "",
    visit ? "visited" : "",
    isPriority ? "priority" : "",
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
        {visit && (
          <span className={`visited-badge ${visit.liked === true ? "liked" : visit.liked === false ? "disliked" : ""}`}>
            {visit.rating !== null
              ? `${"★".repeat(visit.rating)}${"☆".repeat(5 - visit.rating)}`
              : visit.liked === true ? "👍" : visit.liked === false ? "👎" : "✓"}
            {" "}Visited
          </span>
        )}
        <button
          className={`priority-btn ${isPriority ? "active" : ""}`}
          title={isPriority ? "Remove from priority list" : "Add to priority list"}
          onClick={(e) => { e.stopPropagation(); onTogglePriority(listing.id); }}
        >
          {isPriority ? "★" : "☆"}
        </button>
        {onSkipForDay && (
          <button
            className="skip-day-btn"
            title="Hide for today only"
            onClick={(e) => { e.stopPropagation(); onSkipForDay(); }}
          >
            −day
          </button>
        )}
        <button
          className="hide-btn"
          title="Hide this property permanently"
          onClick={(e) => { e.stopPropagation(); onHide(listing.id); }}
        >
          ✕
        </button>
      </div>

      {thumbError ? (
        <div className="card-thumbnail-ph">🏠</div>
      ) : (
        <img
          className="card-thumbnail"
          src={`/api/thumbnail/${listing.id}`}
          alt={listing.address}
          loading="eager"
          onError={() => setThumbError(true)}
        />
      )}

      <div className="card-address">{listing.address}</div>
      <div className="card-details">
        <span>{formatBedsBaths(listing.beds, listing.baths)}</span>
        {listing.sqft && <span>&middot; {listing.sqft.toLocaleString()} sqft</span>}
        {listing.pricePerSqft && <span>&middot; ${listing.pricePerSqft.toLocaleString()}/sqft</span>}
        {listing.propertyType && <span>&middot; {listing.propertyType}</span>}
      </div>

      <div className="card-amenities" onClick={(e) => e.stopPropagation()}>
        <button
          className={`amenity-badge amenity-badge--parking${amenity.parking === true ? " on" : amenity.parking === false ? " off" : ""}`}
          title={amenity.parking === true ? "Has parking — click to mark no parking" : amenity.parking === false ? "No parking — click to clear" : "Parking unknown — click to mark yes"}
          onClick={() => onSetAmenity(listing.id, "parking", amenity.parking === undefined ? true : amenity.parking === true ? false : undefined)}
        >
          🚗 {amenity.parking === true ? "Parking" : amenity.parking === false ? "No parking" : "Parking?"}
        </button>
        <button
          className={`amenity-badge amenity-badge--laundry${amenity.laundry === true ? " on" : amenity.laundry === false ? " off" : ""}`}
          title={amenity.laundry === true ? "In-unit W/D — click to mark no W/D" : amenity.laundry === false ? "No in-unit W/D — click to clear" : "W/D unknown — click to mark yes"}
          onClick={() => onSetAmenity(listing.id, "laundry", amenity.laundry === undefined ? true : amenity.laundry === true ? false : undefined)}
        >
          🫧 {amenity.laundry === true ? "W/D in unit" : amenity.laundry === false ? "No W/D" : "W/D?"}
        </button>
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

      {/* Check-in / Mark visited row */}
      {!visit && (
        <div className="card-checkin-row" onClick={(e) => e.stopPropagation()}>
          {isNearby ? (
            <button
              className="checkin-btn nearby"
              onClick={() => onMarkVisited(listing.id)}
            >
              📍 You're here · Check In
            </button>
          ) : (
            <button
              className="checkin-btn"
              onClick={() => onMarkVisited(listing.id)}
            >
              Mark as visited
            </button>
          )}
        </div>
      )}

      {/* Visit panel — shown after check-in */}
      {visit && (
        <div className="visit-panel" onClick={(e) => e.stopPropagation()}>
          <div className="visit-panel-header">
            <span className="visit-time">Visited at {fmtVisitTime(visit.visitedAt)}</span>
            <button
              className="clear-visit-btn"
              onClick={() => onClearVisit(listing.id)}
              title="Clear visit record"
            >
              Clear
            </button>
          </div>
          <div className="liked-row">
            <span className="liked-label">Liked?</span>
            <button
              className={`liked-btn thumbs-up ${visit.liked === true ? "active" : ""}`}
              onClick={() => onSetLiked(listing.id, visit.liked === true ? null : true)}
              title="I liked it"
            >👍</button>
            <button
              className={`liked-btn thumbs-down ${visit.liked === false ? "active" : ""}`}
              onClick={() => onSetLiked(listing.id, visit.liked === false ? null : false)}
              title="Not for me"
            >👎</button>
          </div>
          <div className="rating-row">
            <span className="rating-label">Rating</span>
            <div className="star-row" onMouseLeave={() => setHoverRating(null)}>
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = hoverRating !== null ? n <= hoverRating : visit.rating !== null && n <= visit.rating;
                return (
                  <button
                    key={n}
                    className={`star-btn ${filled ? "active" : ""}`}
                    onMouseEnter={() => setHoverRating(n)}
                    onClick={() => onSetRating(listing.id, visit.rating === n ? null : n)}
                    title={`${n} star${n > 1 ? "s" : ""}`}
                  >
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="offer-row">
            <button
              className={`offer-btn ${visit.wantOffer ? "active" : ""}`}
              onClick={() => onToggleWantOffer(listing.id)}
              title={visit.wantOffer ? "Remove offer interest" : "Mark as want to offer"}
            >
              {visit.wantOffer ? "🏠 Want to put in an offer" : "Put in an offer?"}
            </button>
          </div>
          <div className="visit-notes-grid">
            <div className="visit-notes-field">
              <label className="visit-notes-label">Pros</label>
              <textarea
                className="visit-notes"
                placeholder="What did you like?"
                value={localPros}
                rows={2}
                onChange={(e) => { setLocalPros(e.target.value); setNotesSaved(false); }}
                onBlur={() => {
                  onSetNoteField(listing.id, "pros", localPros);
                  setNotesSaved(true);
                  setTimeout(() => setNotesSaved(false), 2000);
                }}
              />
            </div>
            <div className="visit-notes-field">
              <label className="visit-notes-label">Cons</label>
              <textarea
                className="visit-notes"
                placeholder="What didn't work?"
                value={localCons}
                rows={2}
                onChange={(e) => { setLocalCons(e.target.value); setNotesSaved(false); }}
                onBlur={() => {
                  onSetNoteField(listing.id, "cons", localCons);
                  setNotesSaved(true);
                  setTimeout(() => setNotesSaved(false), 2000);
                }}
              />
            </div>
          </div>
          {notesSaved && <span className="notes-saved">Saved ✓</span>}
        </div>
      )}

      <div className="card-footer">
        <a
          className="card-link"
          href={listing.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          View on Redfin
        </a>
        <button
          className="card-finance-btn"
          onClick={(e) => { e.stopPropagation(); onOpenFinance(listing.id); }}
        >
          $ Finance
        </button>
      </div>
    </div>
  );
}
