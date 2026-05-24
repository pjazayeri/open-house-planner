import "./DesignPage.css";

const DOC_URL = "https://github.com/pjazayeri/open-house-planner/blob/main/docs/DESIGN.md";

const LAYERS = [
  {
    name: "Client",
    sub: "React + TypeScript + Vite SPA (hash-routed)",
    items: ["Browse · Planner · Priority · Data · Finance · Analytics · Admin", "Hooks: useListings · useHiddenIds · useVisits", "Map: React-Leaflet + OSRM routes"],
  },
  {
    name: "Serverless API",
    sub: "Vercel Functions — secrets never reach the client",
    items: ["/api/sync — per-user state (atomic JSONB merge)", "/api/listings — shared catalog open-house times", "/api/cron-listings — daily Redfin gis-csv ingest", "/api/admin-stats · /api/insights · /api/csv · /api/share"],
  },
  {
    name: "Data & External",
    sub: "Owned data in Neon + Blob; everything else proxied",
    items: ["Neon Postgres: user_state · listings · open_houses", "Vercel Blob: CSVs + thumbnails", "Firebase Auth · Redfin · Anthropic · RentCast · FRED · OSRM"],
  },
];

const DECISIONS = [
  { title: "JSONBin → Neon Postgres", body: "Per-user state is one JSONB row; writes use an atomic `state || patch` merge, eliminating the GET-then-PUT race that caused 'my changes got clobbered' bugs." },
  { title: "Shared catalog, per-user intent", body: "Open-house data is public — stored once and refreshed by one daily cron. A user's favorites/priorities stay separate in user_state." },
  { title: "Address-keyed, not MLS#-keyed", body: "Redfin re-lists homes under new MLS numbers. Keying shared data by a normalized address makes a user's stars survive an MLS# change by construction." },
  { title: "Redfin gis-csv via cron", body: "The cron calls Redfin's own CSV-export endpoint (not HTML scraping) so a user no longer re-uploads weekly just to refresh open-house times." },
  { title: "Self-contained functions", body: "Vercel doesn't bundle cross-src imports into functions, so shared helpers are inlined and browser-only libs avoided server-side." },
  { title: "Server-side auth on every write", body: "Each /api write verifies a Firebase token and derives the uid from it — never a client value — so users can't touch each other's data." },
];

const FLOW = [
  "Redfin gis-csv", "Neon catalog", "overlay onto CSV favorites", "parse + filter + capRate", "useListings (+ cloud state)", "routes → Map / Sidebar",
];

export function DesignPage() {
  return (
    <div className="design-page">
      <div className="design-head">
        <h1>Design &amp; Architecture</h1>
        <a className="design-doclink" href={DOC_URL} target="_blank" rel="noreferrer">Full design doc ↗</a>
      </div>
      <p className="design-intro">
        A single-page app for planning weekend open-house tours in SF. The hard parts aren't the UI —
        they're keeping listing data fresh without manual re-uploads, and never silently losing the
        user's hand-curated state. Here's how it fits together.
      </p>

      <section className="design-section">
        <h2>Architecture at a glance</h2>
        <div className="design-layers">
          {LAYERS.map((l, i) => (
            <div key={l.name} className="design-layer">
              <div className="design-layer-head">
                <span className="design-layer-name">{l.name}</span>
                <span className="design-layer-sub">{l.sub}</span>
              </div>
              <ul>{l.items.map((it) => <li key={it}>{it}</li>)}</ul>
              {i < LAYERS.length - 1 && <div className="design-layer-arrow">↓</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="design-section">
        <h2>Data flow</h2>
        <div className="design-flow">
          {FLOW.map((step, i) => (
            <span key={step} className="design-flow-step">
              {step}{i < FLOW.length - 1 && <span className="design-flow-arrow">→</span>}
            </span>
          ))}
        </div>
        <p className="design-muted">The upload defines <em>which</em> homes are yours; the catalog keeps their open-house <em>times</em> current.</p>
      </section>

      <section className="design-section">
        <h2>Key decisions &amp; trade-offs</h2>
        <div className="design-cards">
          {DECISIONS.map((d) => (
            <div key={d.title} className="design-card">
              <div className="design-card-title">{d.title}</div>
              <p>{d.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="design-muted design-footer">
        Stack: React · TypeScript · Vite · Vercel · Neon Postgres · Firebase · Leaflet.
        Full detail, data model, and ops in the <a href={DOC_URL} target="_blank" rel="noreferrer">design doc</a>.
      </p>
    </div>
  );
}
