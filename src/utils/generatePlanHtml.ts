import type { TimeSlotGroup, Listing } from "../types";
import { formatPrice, formatBedsBaths } from "./formatters";

function fmt12(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtTimeRange(start: Date, end: Date): string {
  const startStr = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const endStr = end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${startStr} – ${endStr}`;
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function capBadgeStyle(capRate: number): string {
  if (capRate >= 3.5) return "background:#f0fdf4;border-color:#86efac;color:#15803d";
  if (capRate >= 2.0) return "background:#fffbeb;border-color:#fcd34d;color:#92400e";
  return "background:#fff1f2;border-color:#fecdd3;color:#be123c";
}

function cardHtml(listing: Listing, globalIndex: number, thumbOrigin: string): string {
  const thumbSrc = `${thumbOrigin}/api/thumbnail/${listing.id}`;
  const timeLabel = listing.openHouseStart.getTime() > 0
    ? fmtTimeRange(listing.openHouseStart, listing.openHouseEnd)
    : "";

  const chips: string[] = [
    `<span class="chip chip--price">${formatPrice(listing.price)}</span>`,
    `<span class="chip">${formatBedsBaths(listing.beds, listing.baths)}</span>`,
  ];
  if (listing.sqft) chips.push(`<span class="chip">${listing.sqft.toLocaleString()} sqft</span>`);
  if (listing.hoa && listing.hoa > 0) chips.push(`<span class="chip">HOA $${Math.round(listing.hoa).toLocaleString()}/mo</span>`);
  chips.push(`<span class="chip chip--cap" style="${capBadgeStyle(listing.capRate)}">${listing.capRate.toFixed(2)}% cap</span>`);

  const neighborhood = [listing.location, listing.city].filter(Boolean).join(" · ");

  return `
<div class="card">
  <div class="card-thumb-wrap">
    <img
      class="card-thumb"
      src="${thumbSrc}"
      alt="${listing.address}"
      onerror="this.style.display='none';this.parentNode.querySelector('.card-thumb-ph').style.display='flex'"
      loading="lazy"
    />
    <div class="card-thumb-ph" style="display:none">🏠</div>
    ${timeLabel ? `<div class="card-badge card-badge--time">${timeLabel}</div>` : ""}
    <div class="card-badge card-badge--num">${globalIndex}</div>
  </div>
  <div class="card-body">
    <div class="card-address">${listing.address}</div>
    ${neighborhood ? `<div class="card-location">${neighborhood}</div>` : ""}
    <div class="card-chips">${chips.join("")}</div>
    <a class="redfin-btn" href="${listing.url}" target="_blank" rel="noopener noreferrer">
      View on Redfin ↗
    </a>
  </div>
</div>`;
}

export function generatePlanHtml(groups: TimeSlotGroup[], origin: string): string {
  const allListings = groups.flatMap((g) => g.listings);
  const total = allListings.length;
  if (total === 0) return "<html><body><p>No listings in plan.</p></body></html>";

  const city = allListings[0]?.city ?? "";

  // Determine the date label from first real-time group
  const firstRealGroup = groups.find((g) => g.startTime.getTime() > 0);
  const dateLabel = firstRealGroup ? fmtDate(firstRealGroup.startTime) : "Open House Tour";

  const generatedAt = new Date().toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  let cardIndex = 0;
  const sectionsHtml = groups.map((group) => {
    const isRealTimeSlot = group.startTime.getTime() > 0;
    const slotLabel = isRealTimeSlot
      ? fmt12(group.startTime) + " – " + fmt12(group.endTime)
      : group.label;

    const cardsHtml = group.listings
      .map((l) => cardHtml(l, ++cardIndex, origin))
      .join("\n");

    return `
<section class="slot-section">
  <div class="slot-header">
    <span class="slot-pill">${slotLabel}</span>
    <div class="slot-line"></div>
    <span class="slot-count">${group.listings.length} propert${group.listings.length === 1 ? "y" : "ies"}</span>
  </div>
  ${cardsHtml}
</section>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Open House Tour · ${dateLabel}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #f1f5f9;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }

    /* ── Cover ─────────────────────────────────────── */
    .cover {
      background: linear-gradient(160deg, #0f172a 0%, #1e3a5f 100%);
      color: white;
      padding: 44px 24px 36px;
      text-align: center;
    }
    .cover-eyebrow {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #60a5fa;
      margin-bottom: 10px;
    }
    .cover-date {
      font-size: clamp(1.6rem, 6vw, 2.6rem);
      font-weight: 800;
      color: #f8fafc;
      line-height: 1.15;
      margin-bottom: 10px;
      letter-spacing: -0.5px;
    }
    .cover-meta {
      font-size: 15px;
      color: #94a3b8;
      display: flex;
      gap: 16px;
      justify-content: center;
      flex-wrap: wrap;
    }
    .cover-meta-sep { color: #334155; }

    /* ── Slot section ───────────────────────────────── */
    .slot-section {
      max-width: 740px;
      margin: 0 auto;
      padding: 32px 16px 0;
    }
    .slot-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }
    .slot-pill {
      background: #1e293b;
      color: #e2e8f0;
      font-size: 12px;
      font-weight: 700;
      padding: 5px 14px;
      border-radius: 999px;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    .slot-line {
      flex: 1;
      height: 1px;
      background: #cbd5e1;
    }
    .slot-count {
      font-size: 12px;
      color: #94a3b8;
      white-space: nowrap;
    }

    /* ── Card ───────────────────────────────────────── */
    .card {
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 6px 20px rgba(0,0,0,0.07);
      margin-bottom: 28px;
    }

    .card-thumb-wrap {
      position: relative;
      background: #e2e8f0;
      overflow: hidden;
    }
    .card-thumb {
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    .card-thumb-ph {
      width: 100%;
      aspect-ratio: 16 / 9;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 72px;
      background: #f1f5f9;
    }

    .card-badge {
      position: absolute;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }
    .card-badge--time {
      top: 14px;
      left: 14px;
      background: rgba(15, 23, 42, 0.80);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      color: white;
      padding: 6px 12px;
      border-radius: 999px;
      letter-spacing: 0.2px;
    }
    .card-badge--num {
      top: 14px;
      right: 14px;
      background: #2563eb;
      color: white;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(37,99,235,0.45);
    }

    .card-body {
      padding: 20px 20px 22px;
    }
    .card-address {
      font-size: clamp(1rem, 4vw, 1.25rem);
      font-weight: 800;
      color: #0f172a;
      line-height: 1.3;
      margin-bottom: 5px;
      letter-spacing: -0.2px;
    }
    .card-location {
      font-size: 13px;
      color: #64748b;
      margin-bottom: 14px;
      font-weight: 500;
    }

    .card-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-bottom: 18px;
    }
    .chip {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 5px 11px;
      font-size: 13px;
      font-weight: 600;
      color: #334155;
    }
    .chip--price {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: #1d4ed8;
      font-size: 15px;
    }
    .chip--cap {
      border-radius: 8px;
      font-size: 12px;
    }

    .redfin-btn {
      display: block;
      background: #cc2128;
      color: white;
      text-decoration: none;
      text-align: center;
      padding: 13px 16px;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.2px;
      transition: background 0.15s;
    }
    .redfin-btn:hover { background: #a81b21; }
    .redfin-btn:active { background: #8b1219; }

    /* ── Footer ─────────────────────────────────────── */
    .page-footer {
      text-align: center;
      padding: 36px 20px 48px;
      color: #94a3b8;
      font-size: 12px;
    }
    .page-footer a { color: #64748b; }

    /* ── Desktop ─────────────────────────────────────── */
    @media (min-width: 640px) {
      .cover { padding: 64px 32px 52px; }
      .slot-section { padding: 40px 24px 0; }
      .card-thumb:hover { transform: scale(1.02); }
      .card-body { padding: 24px 28px 28px; }
    }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-eyebrow">Open House Tour</div>
    <h1 class="cover-date">${dateLabel}</h1>
    <div class="cover-meta">
      <span>${total} propert${total === 1 ? "y" : "ies"}</span>
      ${city ? `<span class="cover-meta-sep">·</span><span>${city}</span>` : ""}
      <span class="cover-meta-sep">·</span>
      <span>${groups.length} time slot${groups.length === 1 ? "" : "s"}</span>
    </div>
  </div>

  ${sectionsHtml}

  <footer class="page-footer">
    Generated ${generatedAt} · <a href="${origin}" target="_blank">Open House Planner</a>
  </footer>
</body>
</html>`;
}
