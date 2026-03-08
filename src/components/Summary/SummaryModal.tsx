import { useState } from "react";
import type { Listing, VisitRecord } from "../../types";
import { formatPrice, formatBedsBaths, formatTimeRange } from "../../utils/formatters";
import "./SummaryModal.css";

interface SummaryModalProps {
  allListings: Listing[];
  visits: Record<string, VisitRecord>;
  priorityIds: Set<string>;
  onClose: () => void;
}

function fmtVisitTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function buildSummaryText(
  allListings: Listing[],
  visits: Record<string, VisitRecord>,
  priorityIds: Set<string>,
): string {
  const byId = Object.fromEntries(allListings.map((l) => [l.id, l]));

  const visited = Object.entries(visits)
    .map(([id, v]) => ({ listing: byId[id], visit: v }))
    .filter((x) => x.listing)
    .sort((a, b) => new Date(a.visit.visitedAt).getTime() - new Date(b.visit.visitedAt).getTime());

  const liked    = visited.filter((x) => x.visit.liked === true);
  const disliked = visited.filter((x) => x.visit.liked === false);
  const neutral  = visited.filter((x) => x.visit.liked === null);

  const unvisitedPriority = allListings
    .filter((l) => priorityIds.has(l.id) && !visits[l.id])
    .sort((a, b) => a.openHouseStart.getTime() - b.openHouseStart.getTime());

  const lines: string[] = [];
  const date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  lines.push(`OPEN HOUSE TOUR SUMMARY`);
  lines.push(`Generated ${date}`);
  lines.push(`${"─".repeat(50)}`);
  lines.push(`${visited.length} visited · ${liked.length} liked · ${disliked.length} disliked · ${unvisitedPriority.length} planned but not visited`);
  lines.push("");

  function formatEntry({ listing: l, visit: v }: { listing: Listing; visit: VisitRecord }) {
    const rating = v.liked === true ? "👍 Liked" : v.liked === false ? "👎 Disliked" : "— No rating";
    lines.push(`${l.address}`);
    lines.push(`  ${formatPrice(l.price)} · ${formatBedsBaths(l.beds, l.baths)}${l.sqft ? ` · ${l.sqft.toLocaleString()} sqft` : ""} · ${l.capRate.toFixed(1)}% cap`);
    lines.push(`  ${formatTimeRange(l.openHouseStart, l.openHouseEnd)} · ${rating}`);
    lines.push(`  Visited: ${fmtVisitTime(v.visitedAt)}`);
    if (v.notes.trim()) lines.push(`  Notes: ${v.notes.trim()}`);
    lines.push("");
  }

  if (liked.length > 0) {
    lines.push(`👍 LIKED (${liked.length})`);
    lines.push(`${"─".repeat(30)}`);
    liked.forEach(formatEntry);
  }

  if (neutral.length > 0) {
    lines.push(`— NO RATING (${neutral.length})`);
    lines.push(`${"─".repeat(30)}`);
    neutral.forEach(formatEntry);
  }

  if (disliked.length > 0) {
    lines.push(`👎 DISLIKED (${disliked.length})`);
    lines.push(`${"─".repeat(30)}`);
    disliked.forEach(formatEntry);
  }

  if (unvisitedPriority.length > 0) {
    lines.push(`★ PLANNED BUT NOT VISITED (${unvisitedPriority.length})`);
    lines.push(`${"─".repeat(30)}`);
    for (const l of unvisitedPriority) {
      lines.push(`${l.address}`);
      lines.push(`  ${formatPrice(l.price)} · ${formatBedsBaths(l.beds, l.baths)}${l.sqft ? ` · ${l.sqft.toLocaleString()} sqft` : ""} · ${l.capRate.toFixed(1)}% cap`);
      lines.push(`  ${formatTimeRange(l.openHouseStart, l.openHouseEnd)}`);
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

export function SummaryModal({ allListings, visits, priorityIds, onClose }: SummaryModalProps) {
  const text = buildSummaryText(allListings, visits, priorityIds);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="summary-overlay" onClick={onClose}>
      <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
        <div className="summary-header">
          <h2>Tour Summary</h2>
          <div className="summary-actions">
            <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button className="summary-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <pre className="summary-body">{text}</pre>
      </div>
    </div>
  );
}
