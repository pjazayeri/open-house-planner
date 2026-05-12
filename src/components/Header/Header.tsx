import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../../hooks/useTheme";
import type { TimeSlotGroup } from "../../types";
import type { SyncStatus } from "../../utils/cloudSync";
import type { Page } from "../../App";
import type { AuthMode } from "../../hooks/useAuth";
import "./Header.css";

interface AuthUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

interface HeaderProps {
  page: Page;
  onNavigate: (page: Page) => void;
  cities: string[];
  selectedCity: string;
  onCityChange: (city: string) => void;
  timeSlotGroups: TimeSlotGroup[];
  totalListings: number;
  hiddenCount: number;
  onRestoreHidden: () => void;
  syncStatus: SyncStatus;
  saveFailed: boolean;
  authMode: AuthMode;
  user: AuthUser | null;
  onSignOut: () => Promise<void>;
  onShowSummary: () => void;
  onUploadCsv: (text: string) => Promise<number>;
  onSharePlan: () => Promise<{ planUrl: string; mapUrl: string }>;
}


function SyncBadge({ syncStatus, saveFailed }: { syncStatus: SyncStatus; saveFailed: boolean }) {
  let cls = "sync-badge";
  let title = "";

  if (saveFailed) {
    cls += " sync-badge--warn";
    title = "Last save failed \u2014 changes may not be synced";
  } else if (syncStatus === "ok") {
    cls += " sync-badge--ok";
    title = "Synced to cloud";
  } else if (syncStatus === "error") {
    cls += " sync-badge--error";
    title = "Cloud sync error";
  } else if (syncStatus === "degraded") {
    cls += " sync-badge--warn";
    title = "Cloud sync unavailable (invalid credentials) \u2014 running locally";
  } else {
    cls += " sync-badge--grey";
    title = syncStatus === "loading" ? "Syncing\u2026" : "Cloud sync not configured";
  }

  return <span className={cls} title={title} aria-label={title} />;
}

export function Header({
  page,
  onNavigate,
  cities,
  selectedCity,
  onCityChange,
  timeSlotGroups,
  totalListings,
  hiddenCount,
  onRestoreHidden,
  syncStatus,
  saveFailed,
  authMode,
  user,
  onSignOut,
  onShowSummary,
  onUploadCsv,
  onSharePlan,
}: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { theme, toggleTheme } = useTheme();
  const [toast, setToast] = useState<{ msg: string; kind: "loading" | "ok" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareLinks, setShareLinks] = useState<{ planUrl: string; mapUrl: string } | null>(null);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const shareDropdownRef = useRef<HTMLDivElement>(null);
  // Dropdown is rendered via portal (out of `.header-nav` which has overflow:auto
  // on mobile and would clip it). Position is computed from the button's rect.
  const [shareDropdownPos, setShareDropdownPos] = useState<{ top: number; right: number } | null>(null);

  // Position is set synchronously by the click handler before setShareLinks
  // so the very first render with a non-null `shareLinks` already has a
  // valid position — avoids a one-frame "invisible dropdown" flash on
  // mobile that was confusing users into thinking nothing happened.
  useLayoutEffect(() => {
    if (!shareLinks) { setShareDropdownPos(null); return; }
    function reposition() {
      const btn = shareBtnRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      setShareDropdownPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [shareLinks]);

  function computeDropdownPos() {
    const btn = shareBtnRef.current;
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) };
  }

  useEffect(() => {
    if (!shareLinks) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = shareBtnRef.current?.contains(target);
      const inDropdown = shareDropdownRef.current?.contains(target);
      if (!inBtn && !inDropdown) setShareLinks(null);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [shareLinks]);

  function showToast(msg: string, kind: "loading" | "ok" | "error", autoDismiss = false) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    if (autoDismiss) toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") {
        showToast("Loading\u2026", "loading");
        onUploadCsv(text).then((count) => {
          showToast(`${count} listings loaded`, "ok", true);
        }).catch(() => showToast("Failed to load CSV", "error", true));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }
  const cityCount = timeSlotGroups.reduce(
    (sum, g) => sum + g.listings.length,
    0
  );

  return (
    <header className="header">
      <div className="header-left">
        <h1 className="header-title">Open House Planner</h1>
        <span className="header-stats">
          {cityCount} open houses in {selectedCity} &middot; {totalListings}{" "}
          total
        </span>
        {hiddenCount > 0 && (
          <button className="restore-btn" onClick={onRestoreHidden}>
            {hiddenCount} hidden &middot; Restore
          </button>
        )}
        <SyncBadge syncStatus={syncStatus} saveFailed={saveFailed} />
      </div>

      <nav className="header-nav">
        <button
          className={`nav-tab ${page === "home" ? "active" : ""}`}
          onClick={() => onNavigate("home")}
        >
          Browse
        </button>
        <button
          className={`nav-tab ${page === "planner" || page === "priority" ? "active" : ""}`}
          onClick={() => onNavigate("planner")}
        >
          Open Houses
        </button>
        <button
          className={`nav-tab ${page === "data" ? "active" : ""}`}
          onClick={() => onNavigate("data")}
        >
          Data
        </button>
        <button
          className={`nav-tab ${page === "finance" ? "active" : ""}`}
          onClick={() => onNavigate("finance")}
        >
          Finance
        </button>
        <button
          className={`nav-tab ${page === "analytics" ? "active" : ""}`}
          onClick={() => onNavigate("analytics")}
        >
          Analytics
        </button>
        <button className="nav-tab nav-tab--summary" onClick={onShowSummary}>
          Summary
        </button>
        <button
          className="nav-tab nav-tab--theme"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          data-testid="theme-toggle"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        {(page === "planner" || page === "priority") && (
          <>
            <button
              ref={shareBtnRef}
              className="nav-tab nav-tab--share"
              title="Generate shareable links for your open house plan"
              onClick={async () => {
                if (shareLinks) { setShareLinks(null); return; }
                showToast("Generating links…", "loading");
                try {
                  const links = await onSharePlan();
                  setToast(null);
                  setShareDropdownPos(computeDropdownPos());
                  setShareLinks(links);
                } catch {
                  showToast("Failed to create plan link", "error", true);
                }
              }}
            >
              Share Plan ↗
            </button>
            {shareLinks && createPortal(
              <>
                {/* Mobile-only backdrop; CSS hides on desktop. Tap-to-close. */}
                <div className="share-plan-backdrop" onClick={() => setShareLinks(null)} />
                <div
                  ref={shareDropdownRef}
                  className="share-plan-dropdown share-plan-dropdown--portal"
                  // Inline top/right used on desktop; the mobile media query
                  // overrides both with !important to center the modal.
                  style={{
                    top: shareDropdownPos?.top ?? 64,
                    right: shareDropdownPos?.right ?? 12,
                  }}
                  data-testid="share-plan-dropdown"
                >
                <div className="share-plan-row">
                  <span className="share-plan-label">Full plan</span>
                  <a href={shareLinks.planUrl} target="_blank" rel="noopener noreferrer" className="share-plan-link">Open ↗</a>
                  <button
                    className="share-plan-copy"
                    onClick={() => { navigator.clipboard.writeText(shareLinks.planUrl); }}
                    title="Copy link"
                  >Copy</button>
                </div>
                <div className="share-plan-row">
                  <span className="share-plan-label">Map only</span>
                  <a href={shareLinks.mapUrl} target="_blank" rel="noopener noreferrer" className="share-plan-link">Open ↗</a>
                  <button
                    className="share-plan-copy"
                    onClick={() => { navigator.clipboard.writeText(shareLinks.mapUrl); }}
                    title="Copy link"
                  >Copy</button>
                </div>
                </div>
              </>,
              document.body
            )}
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          className="nav-tab nav-tab--upload"
          onClick={() => fileInputRef.current?.click()}
          title="Upload a Redfin favorites CSV to update listings"
        >
          ↑ Upload CSV
        </button>
        <a
          className="nav-tab nav-tab--redfin"
          href="https://www.redfin.com/myredfin/favorites"
          target="_blank"
          rel="noreferrer"
          title="Go to Redfin favorites to download CSV"
        >
          Redfin Favorites ↗
        </a>
      </nav>
      {toast && (
        <div className={`ingest-toast ingest-toast--${toast.kind}`} onClick={() => setToast(null)}>
          {toast.kind === "loading" && <span className="ingest-toast-spinner" />}
          {toast.msg}
        </div>
      )}

      <div className="header-right">
        {cities.length > 1 && (
          <select
            className="city-select"
            value={selectedCity}
            onChange={(e) => onCityChange(e.target.value)}
          >
            {cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        )}
        {authMode === "signed-in" && user && (
          <div className="user-menu">
            {user.photoURL
              ? <img className="user-avatar" src={user.photoURL} alt={user.displayName ?? ""} referrerPolicy="no-referrer" />
              : <span className="user-avatar user-avatar--initials">{(user.displayName ?? user.email ?? "?")[0].toUpperCase()}</span>
            }
            <button className="user-signout" onClick={onSignOut} title="Sign out">
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
