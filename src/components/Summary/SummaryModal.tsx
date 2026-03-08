import { useState, useRef } from "react";
import Anthropic from "@anthropic-ai/sdk";
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
  const wantOfferCount = visited.filter((x) => x.visit.wantOffer).length;
  lines.push(`${visited.length} visited · ${liked.length} liked · ${disliked.length} disliked · ${wantOfferCount > 0 ? `${wantOfferCount} want to offer · ` : ""}${unvisitedPriority.length} planned but not visited`);
  lines.push("");

  function formatEntry({ listing: l, visit: v }: { listing: Listing; visit: VisitRecord }) {
    const likedStr = v.liked === true ? "👍" : v.liked === false ? "👎" : "";
    const starsStr = v.rating !== null ? `${"★".repeat(v.rating)}${"☆".repeat(5 - v.rating)}` : "";
    const ratingStr = [likedStr, starsStr].filter(Boolean).join(" ") || "— No rating";
    lines.push(`${l.address}`);
    lines.push(`  ${formatPrice(l.price)} · ${formatBedsBaths(l.beds, l.baths)}${l.sqft ? ` · ${l.sqft.toLocaleString()} sqft` : ""} · ${l.capRate.toFixed(1)}% cap`);
    lines.push(`  ${formatTimeRange(l.openHouseStart, l.openHouseEnd)} · ${ratingStr}`);
    lines.push(`  Visited: ${fmtVisitTime(v.visitedAt)}`);
    if (v.wantOffer) lines.push(`  ★ Want to put in an offer`);
    if (v.pros.trim()) lines.push(`  Pros: ${v.pros.trim()}`);
    if (v.cons.trim()) lines.push(`  Cons: ${v.cons.trim()}`);
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

type InsightsState = "idle" | "loading" | "done" | "error";

export function SummaryModal({ allListings, visits, priorityIds, onClose }: SummaryModalProps) {
  const text = buildSummaryText(allListings, visits, priorityIds);
  const [copied, setCopied] = useState(false);
  const [insightsState, setInsightsState] = useState<InsightsState>("idle");
  const [insights, setInsights] = useState("");
  const [insightsError, setInsightsError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleGenerateInsights = async () => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      setInsightsError("Add VITE_ANTHROPIC_API_KEY to .env.local to enable AI insights.");
      setInsightsState("error");
      return;
    }

    abortRef.current = new AbortController();
    setInsightsState("loading");
    setInsights("");
    setInsightsError("");

    try {
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

      const stream = client.messages.stream({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: `You are a helpful real estate advisor analyzing open house visit notes.
Be concise, practical, and direct.`,
        messages: [
          {
            role: "user",
            content: `Here is my open house tour summary. Please analyze it and summarize noting:
1. What was liked
2. What wasn't liked
3. What were the reasons for liking properties
4. What were the reasons for not liking properties

Tour data:
${text}`,
          },
        ],
      });

      for await (const event of stream) {
        if (abortRef.current?.signal.aborted) break;
        if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta.type === "text_delta") {
            setInsights((prev) => prev + delta.text);
          }
        }
      }

      setInsightsState("done");
    } catch (err) {
      if (abortRef.current?.signal.aborted) return;
      setInsightsError(err instanceof Error ? err.message : "Failed to generate insights.");
      setInsightsState("error");
    }
  };

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  const canGenerateInsights = allListings.length > 0;

  return (
    <div className="summary-overlay" onClick={handleClose}>
      <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
        <div className="summary-header">
          <h2>Tour Summary</h2>
          <div className="summary-actions">
            <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy}>
              {copied ? "Copied ✓" : "Copy"}
            </button>
            <button className="summary-close" onClick={handleClose}>✕</button>
          </div>
        </div>

        <div className="summary-tabs">
          <pre className="summary-body">{text}</pre>

          {canGenerateInsights && (
            <div className="insights-section">
              <div className="insights-header">
                <span className="insights-title">AI Insights</span>
                <button
                  className={`insights-btn ${insightsState === "loading" ? "loading" : ""}`}
                  onClick={handleGenerateInsights}
                  disabled={insightsState === "loading"}
                >
                  {insightsState === "loading"
                    ? "Generating…"
                    : insightsState === "done"
                    ? "Regenerate"
                    : "Generate Insights"}
                </button>
              </div>

              {insightsState === "loading" && insights === "" && (
                <div className="insights-spinner-row">
                  <div className="insights-spinner" />
                  <span>Analyzing your tour…</span>
                </div>
              )}

              {(insightsState === "loading" || insightsState === "done") && insights && (
                <div className="insights-body">{insights}</div>
              )}

              {insightsState === "error" && (
                <div className="insights-error">{insightsError}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
