import { useEffect, useState } from "react";
import { getAuthHeaders } from "../../utils/cloudSync";
import "./AdminPage.css";

// --- response shape (mirrors api/admin-stats.ts) ---
interface Settled<T> { value?: T; error?: string }
interface NeonStats {
  dbBytes: number;
  tables: { name: string; bytes: number; rows: number | null }[];
  catalog: { lastIngest: string | null; upcomingOpenHouses: number; openHouseRange: { min: string | null; max: string | null } };
}
interface BlobStats { totalBytes: number; count: number; truncated: boolean }
interface FirebaseStats { userCount: number }
interface AdminStats {
  generatedAt: string;
  neon: Settled<NeonStats>;
  blob: Settled<BlobStats>;
  firebase: Settled<FirebaseStats>;
}

const GB = 1024 ** 3;
const NEON_FREE_BYTES = 0.5 * GB; // Neon free tier storage cap

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < GB) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / GB).toFixed(2)} GB`;
}
function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function UsageBar({ used, cap }: { used: number; cap: number }) {
  const pct = Math.min(100, (used / cap) * 100);
  const tone = pct > 80 ? "bad" : pct > 50 ? "warn" : "good";
  return (
    <div className="usage-bar">
      <div className={`usage-bar-fill usage-bar-fill--${tone}`} style={{ width: `${pct}%` }} />
      <span className="usage-bar-label">{fmtBytes(used)} / {fmtBytes(cap)} ({pct.toFixed(1)}%)</span>
    </div>
  );
}

const METERED_DEPS = [
  { name: "Vercel", note: "Bandwidth, function compute, 1 cron/day (Hobby). No usage API — check live.", href: "https://vercel.com/dashboard/usage" },
  { name: "Neon compute / egress", note: "~100 compute-hrs & ~5 GB egress/mo (free). Scales to zero when idle.", href: "https://console.neon.tech" },
  { name: "Anthropic API", note: "AI tour insights — usage-based billing.", href: "https://console.anthropic.com/settings/usage" },
  { name: "RentCast", note: "Rent estimates — ~50 requests/mo on free tier.", href: "https://app.rentcast.io" },
];

export function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "forbidden" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/admin-stats", { headers });
        if (res.status === 401 || res.status === 403) { setStatus("forbidden"); return; }
        if (!res.ok) { setErrMsg(`HTTP ${res.status}`); setStatus("error"); return; }
        setStats(await res.json());
        setStatus("ok");
      } catch (e) {
        setErrMsg(String(e));
        setStatus("error");
      }
    })();
  }, []);

  if (status === "loading") return <div className="admin-page"><p className="admin-muted">Loading usage…</p></div>;
  if (status === "forbidden") return <div className="admin-page"><h1>Admin</h1><p className="admin-muted">You don't have access to this page.</p></div>;
  if (status === "error") return <div className="admin-page"><h1>Admin</h1><p className="admin-error">Couldn't load stats: {errMsg}</p></div>;

  const neon = stats!.neon.value;
  const blob = stats!.blob.value;
  const fb = stats!.firebase.value;

  return (
    <div className="admin-page">
      <div className="admin-head">
        <h1>Observability</h1>
        <span className="admin-muted">as of {fmtDate(stats!.generatedAt)}</span>
      </div>

      <section className="admin-section">
        <h2>Storage &amp; data volume <span className="admin-tag">live</span></h2>
        <div className="admin-cards">
          {/* Neon */}
          <div className="admin-card">
            <div className="admin-card-title">Neon Postgres</div>
            {neon ? (
              <>
                <UsageBar used={neon.dbBytes} cap={NEON_FREE_BYTES} />
                <table className="admin-table">
                  <thead><tr><th>Table</th><th>Rows</th><th>Size</th></tr></thead>
                  <tbody>
                    {neon.tables.map((t) => (
                      <tr key={t.name}><td>{t.name}</td><td>{t.rows ?? "—"}</td><td>{fmtBytes(t.bytes)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p className="admin-error">{stats!.neon.error}</p>}
          </div>

          {/* Blob */}
          <div className="admin-card">
            <div className="admin-card-title">Vercel Blob <span className="admin-muted">(CSVs + thumbnails)</span></div>
            {blob ? (
              <div className="admin-stat-rows">
                <div><span className="admin-big">{fmtBytes(blob.totalBytes)}</span><span className="admin-muted"> stored</span></div>
                <div><span className="admin-big">{blob.count}</span><span className="admin-muted"> objects{blob.truncated ? "+ (truncated)" : ""}</span></div>
              </div>
            ) : <p className="admin-error">{stats!.blob.error}</p>}
          </div>

          {/* Firebase */}
          <div className="admin-card">
            <div className="admin-card-title">Firebase Auth</div>
            {fb ? (
              <div className="admin-stat-rows"><div><span className="admin-big">{fb.userCount}</span><span className="admin-muted"> users</span></div></div>
            ) : <p className="admin-error">{stats!.firebase.error}</p>}
          </div>
        </div>
      </section>

      {neon && (
        <section className="admin-section">
          <h2>Listing catalog health <span className="admin-tag">live</span></h2>
          <div className="admin-stat-rows admin-stat-rows--inline">
            <div><span className="admin-big">{neon.catalog.upcomingOpenHouses}</span><span className="admin-muted"> upcoming open houses</span></div>
            <div><span className="admin-muted">last ingest:</span> {fmtDate(neon.catalog.lastIngest)}</div>
            <div><span className="admin-muted">OH range:</span> {fmtDate(neon.catalog.openHouseRange.min)} → {fmtDate(neon.catalog.openHouseRange.max)}</div>
          </div>
        </section>
      )}

      <section className="admin-section">
        <h2>Metered dependencies <span className="admin-tag admin-tag--ref">reference</span></h2>
        <p className="admin-muted">No clean usage API — open each console to see live numbers.</p>
        <div className="admin-cards">
          {METERED_DEPS.map((d) => (
            <a key={d.name} className="admin-card admin-card--link" href={d.href} target="_blank" rel="noreferrer">
              <div className="admin-card-title">{d.name} ↗</div>
              <p className="admin-muted">{d.note}</p>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
