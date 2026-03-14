import { useMemo } from "react";
import type { Listing, VisitRecord } from "../../types";
import "./AnalyticsPage.css";

interface AnalyticsPageProps {
  allListings: Listing[];
  visits: Record<string, VisitRecord>;
  hiddenIds: Set<string>;
  priorityIds: Set<string>;
}

function formatPrice(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="an-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= Math.round(rating) ? "an-star filled" : "an-star"}>★</span>
      ))}
    </span>
  );
}

export function AnalyticsPage({ allListings, visits, hiddenIds, priorityIds }: AnalyticsPageProps) {
  const visitedListings = useMemo(() => {
    return allListings.filter((l) => visits[l.id]);
  }, [allListings, visits]);

  const stats = useMemo(() => {
    const visited = visitedListings.length;
    const total = allListings.filter((l) => !hiddenIds.has(l.id)).length;
    const rated = visitedListings.filter((l) => visits[l.id].rating !== null);
    const avgRating =
      rated.length > 0
        ? rated.reduce((s, l) => s + (visits[l.id].rating ?? 0), 0) / rated.length
        : null;
    const liked = visitedListings.filter((l) => visits[l.id].liked === true).length;
    const disliked = visitedListings.filter((l) => visits[l.id].liked === false).length;
    const wantOffer = visitedListings.filter((l) => visits[l.id].wantOffer).length;
    const priority = priorityIds.size;
    return { visited, total, avgRating, liked, disliked, wantOffer, priority };
  }, [visitedListings, allListings, hiddenIds, priorityIds, visits]);

  const ratingDist = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    visitedListings.forEach((l) => {
      const r = visits[l.id].rating;
      if (r !== null && r >= 1 && r <= 5) counts[r]++;
    });
    const max = Math.max(...Object.values(counts), 1);
    return { counts, max };
  }, [visitedListings, visits]);

  const timeline = useMemo(() => {
    const byDay: Record<string, Listing[]> = {};
    visitedListings.forEach((l) => {
      const v = visits[l.id];
      const day = v.visitedAt.slice(0, 10); // YYYY-MM-DD
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(l);
    });
    const days = Object.keys(byDay).sort();
    if (days.length < 2) return null;
    const maxVisits = Math.max(...days.map((d) => byDay[d].length));
    return days.map((day) => {
      const listings = byDay[day];
      const rated = listings.filter((l) => visits[l.id].rating !== null);
      const avgRating =
        rated.length > 0
          ? rated.reduce((s, l) => s + (visits[l.id].rating ?? 0), 0) / rated.length
          : null;
      const liked = listings.filter((l) => visits[l.id].liked === true).length;
      const disliked = listings.filter((l) => visits[l.id].liked === false).length;
      const date = new Date(day + "T12:00:00");
      const label = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      return { day, label, count: listings.length, avgRating, liked, disliked, maxVisits };
    });
  }, [visitedListings, visits]);

  const topRated = useMemo(() => {
    return visitedListings
      .filter((l) => (visits[l.id].rating ?? 0) >= 4)
      .sort((a, b) => {
        const rDiff = (visits[b.id].rating ?? 0) - (visits[a.id].rating ?? 0);
        return rDiff !== 0 ? rDiff : a.price - b.price;
      });
  }, [visitedListings, visits]);

  const wantOfferListings = useMemo(() => {
    return visitedListings.filter((l) => visits[l.id].wantOffer);
  }, [visitedListings, visits]);

  const priceCapComparison = useMemo(() => {
    const groups = {
      visited: visitedListings,
      liked: visitedListings.filter((l) => visits[l.id].liked === true),
      disliked: visitedListings.filter((l) => visits[l.id].liked === false),
    };
    function avg(arr: Listing[], fn: (l: Listing) => number) {
      if (arr.length === 0) return null;
      return arr.reduce((s, l) => s + fn(l), 0) / arr.length;
    }
    return Object.entries(groups).map(([key, arr]) => ({
      key,
      count: arr.length,
      avgPrice: avg(arr, (l) => l.price),
      avgCapRate: avg(arr, (l) => l.capRate),
    }));
  }, [visitedListings, visits]);

  if (visitedListings.length === 0) {
    return (
      <div className="an-page">
        <div className="an-header">
          <h2 className="an-title">Analytics</h2>
        </div>
        <div className="an-empty">
          <p>No visits recorded yet.</p>
          <p className="an-empty-sub">Visit some open houses and rate them to see your analytics here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="an-page">
      <div className="an-header">
        <h2 className="an-title">Analytics</h2>
        <span className="an-subtitle">{stats.visited} visits recorded</span>
      </div>

      <div className="an-body">
        {/* Overview stat cards */}
        <section className="an-section">
          <h3 className="an-section-title">Overview</h3>
          <div className="an-stat-grid">
            <div className="an-stat-card">
              <div className="an-stat-value">{stats.visited} / {stats.total}</div>
              <div className="an-stat-label">Visited</div>
              <div className="an-stat-sub">{Math.round((stats.visited / Math.max(stats.total, 1)) * 100)}%</div>
            </div>
            <div className="an-stat-card">
              <div className="an-stat-value">
                {stats.avgRating !== null ? `★ ${stats.avgRating.toFixed(1)}` : "—"}
              </div>
              <div className="an-stat-label">Avg Rating</div>
              <div className="an-stat-sub">of rated only</div>
            </div>
            <div className="an-stat-card an-stat-card--green">
              <div className="an-stat-value">{stats.liked} 👍</div>
              <div className="an-stat-label">Liked</div>
            </div>
            <div className="an-stat-card an-stat-card--red">
              <div className="an-stat-value">{stats.disliked} 👎</div>
              <div className="an-stat-label">Disliked</div>
            </div>
            <div className="an-stat-card an-stat-card--purple">
              <div className="an-stat-value">{stats.wantOffer} 🏠</div>
              <div className="an-stat-label">Want to Offer</div>
            </div>
            <div className="an-stat-card an-stat-card--yellow">
              <div className="an-stat-value">{stats.priority} ★</div>
              <div className="an-stat-label">Priority</div>
            </div>
          </div>
        </section>

        {/* Rating distribution */}
        <section className="an-section">
          <h3 className="an-section-title">Rating Distribution</h3>
          <div className="an-rating-dist">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = ratingDist.counts[star] ?? 0;
              const pct = (count / ratingDist.max) * 100;
              return (
                <div key={star} className="an-rating-row">
                  <span className="an-rating-label">{star}★</span>
                  <div className="an-rating-bar-bg">
                    <div className="an-rating-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="an-rating-count">{count}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Visit timeline */}
        {timeline && (
          <section className="an-section">
            <h3 className="an-section-title">Visit Timeline</h3>
            <div className="an-timeline">
              {timeline.map((day) => (
                <div key={day.day} className="an-timeline-row">
                  <span className="an-timeline-label">{day.label}</span>
                  <div className="an-timeline-bar-bg">
                    <div
                      className="an-timeline-bar-fill"
                      style={{ width: `${(day.count / day.maxVisits) * 100}%` }}
                    />
                  </div>
                  <span className="an-timeline-meta">
                    {day.count} visit{day.count !== 1 ? "s" : ""}
                    {day.avgRating !== null && <> &middot; ★ {day.avgRating.toFixed(1)}</>}
                    {day.liked > 0 && <> &middot; <span className="green">👍 {day.liked}</span></>}
                    {day.disliked > 0 && <> &middot; <span className="red">👎 {day.disliked}</span></>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Top-rated listings */}
        {topRated.length > 0 && (
          <section className="an-section">
            <h3 className="an-section-title">Top Rated (4★+)</h3>
            <div className="an-listing-list">
              {topRated.map((l) => {
                const v = visits[l.id];
                return (
                  <div key={l.id} className="an-listing-card">
                    <div className="an-listing-main">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="an-listing-address">
                        {l.address}
                      </a>
                      <div className="an-listing-meta">
                        <Stars rating={v.rating!} />
                        <span className="an-listing-price">{formatPrice(l.price)}</span>
                        <span className="an-listing-cap">{l.capRate.toFixed(2)}% cap</span>
                        {v.liked === true && <span className="an-badge an-badge--green">👍</span>}
                        {v.liked === false && <span className="an-badge an-badge--red">👎</span>}
                        {v.wantOffer && <span className="an-badge an-badge--purple">Want Offer</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Want to offer */}
        {wantOfferListings.length > 0 && (
          <section className="an-section">
            <h3 className="an-section-title">Want to Offer 🏠</h3>
            <div className="an-listing-list">
              {wantOfferListings.map((l) => {
                const v = visits[l.id];
                return (
                  <div key={l.id} className="an-listing-card">
                    <div className="an-listing-main">
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="an-listing-address">
                        {l.address}
                      </a>
                      <div className="an-listing-meta">
                        {v.rating !== null && <Stars rating={v.rating} />}
                        <span className="an-listing-price">{formatPrice(l.price)}</span>
                        <span className="an-listing-cap">{l.capRate.toFixed(2)}% cap</span>
                        {v.liked === true && <span className="an-badge an-badge--green">👍</span>}
                        {v.liked === false && <span className="an-badge an-badge--red">👎</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Price & cap rate comparison */}
        <section className="an-section">
          <h3 className="an-section-title">Price &amp; Cap Rate Comparison</h3>
          <div className="an-comparison-table">
            <div className="an-comparison-header">
              <span />
              <span>Count</span>
              <span>Avg Price</span>
              <span>Avg Cap Rate</span>
            </div>
            {priceCapComparison.map(({ key, count, avgPrice, avgCapRate }) => (
              <div key={key} className="an-comparison-row">
                <span className="an-comparison-label">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                <span>{count}</span>
                <span>{avgPrice !== null ? formatPrice(avgPrice) : "—"}</span>
                <span>{avgCapRate !== null ? `${avgCapRate.toFixed(2)}%` : "—"}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
