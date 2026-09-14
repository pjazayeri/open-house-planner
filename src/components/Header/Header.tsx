import { useRef, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { Theme } from "../../hooks/useTheme";
import type { TimeSlotGroup } from "../../types";
import type { SyncStatus } from "../../utils/cloudSync";
import type { Page } from "../../App";
import type { AuthMode } from "../../hooks/useAuth";
import { timeAgo, describeRefresh, type RefreshResult } from "../../utils/catalog";
import { CSV_ACCEPT } from "../../utils/csvUpload";
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
  isAdmin?: boolean;
  onSignOut: () => Promise<void>;
  onShowSummary: () => void;
  onUploadCsv: (text: string) => Promise<number>;
  onSharePlan: () => Promise<{ planUrl: string; mapUrl: string }>;
  theme: Theme;
  onToggleTheme: () => void;
  /** "Refresh listings" — pulls fresh Redfin data and re-merges. null = not available (guest/demo). */
  onRefreshListings?: () => Promise<RefreshResult | null>;
  listingsUpdatedAt?: Date | null;
  refreshing?: boolean;
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  );
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
  isAdmin,
  onSignOut,
  onShowSummary,
  onUploadCsv,
  onSharePlan,
  theme,
  onToggleTheme,
  onRefreshListings,
  listingsUpdatedAt = null,
  refreshing = false,
}: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "loading" | "ok" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shareLinks, setShareLinks] = useState<{ planUrl: string; mapUrl: string } | null>(null);
  // Account / actions menu (bottom sheet on phones — replaces the nav row there).
  const [menuOpen, setMenuOpen] = useState(false);
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

  async function handleShare() {
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
  }

  const avatar = user
    ? (user.photoURL
        ? <img className="user-avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
        : <span className="user-avatar user-avatar--initials">{(user.displayName ?? user.email ?? "?")[0].toUpperCase()}</span>)
    : <span className="user-avatar user-avatar--initials" aria-hidden="true">⋯</span>;

  const syncLabel = saveFailed ? "Last save failed"
    : syncStatus === "ok" ? "Synced"
    : syncStatus === "loading" ? "Syncing…"
    : syncStatus === "error" ? "Sync error"
    : syncStatus === "degraded" ? "Sync unavailable"
    : authMode === "demo" ? "Demo — changes don't save"
    : authMode === "guest" ? "Guest — saved on this device"
    : "Not synced";

  function menuAction(fn: () => void) {
    return () => { setMenuOpen(false); fn(); };
  }

  async function handleRefresh() {
    if (refreshing) return;
    if (!onRefreshListings || authMode !== "signed-in") {
      showToast("Sign in to refresh listings from Redfin", "error", true);
      return;
    }
    showToast("Refreshing listings from Redfin…", "loading");
    try {
      const r = await onRefreshListings();
      if (!r) { showToast("Couldn't refresh listings", "error", true); return; }
      showToast(describeRefresh(r), "ok", true);
    } catch {
      showToast("Couldn't refresh listings", "error", true);
    }
  }

  const freshness = listingsUpdatedAt ? timeAgo(listingsUpdatedAt) : "";

  return (
    <header className="header">
      <div className="header-left">
        <h1 className={`header-title${cities.length > 1 ? " header-title--desktop" : ""}`}>Open House Planner</h1>
        {cities.length > 1 && (
          /* Phones: the city selector IS the title (desktop shows the pill on the right) */
          <select
            className="city-select city-select--title"
            value={selectedCity}
            onChange={(e) => onCityChange(e.target.value)}
            aria-label="City"
          >
            {cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        )}
        <span className="header-stats">
          {/* Phones show the city in the pill, so the long form is desktop-only */}
          <span className="header-stats-long">
            {cityCount} open house{cityCount === 1 ? "" : "s"} in {selectedCity} &middot; {totalListings} total
            {freshness && <span className="header-freshness" title="When listing data was last pulled from Redfin"> &middot; updated {freshness}</span>}
          </span>
          <span className="header-stats-short">
            {cityCount} open house{cityCount === 1 ? "" : "s"} &middot; {totalListings} total
            {freshness && <span className="header-freshness"> &middot; {freshness}</span>}
          </span>
          <SyncBadge syncStatus={syncStatus} saveFailed={saveFailed} />
        </span>
        {hiddenCount > 0 && (
          <button className="restore-btn" onClick={onRestoreHidden}>
            {hiddenCount} hidden &middot; Restore
          </button>
        )}
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
        {isAdmin && (
          <button
            className={`nav-tab ${page === "admin" ? "active" : ""}`}
            onClick={() => onNavigate("admin")}
          >
            Admin
          </button>
        )}
        {isAdmin && (
          <button
            className={`nav-tab ${page === "design" ? "active" : ""}`}
            onClick={() => onNavigate("design")}
          >
            Design
          </button>
        )}
        <button className="nav-tab nav-tab--summary" onClick={onShowSummary}>
          Summary
        </button>
        <button
          className="nav-tab nav-tab--theme"
          onClick={onToggleTheme}
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
              onClick={() => void handleShare()}
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
          accept={CSV_ACCEPT}
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          className={`nav-tab nav-tab--refresh${refreshing ? " is-refreshing" : ""}`}
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          title={freshness ? `Pull fresh listing data from Redfin (last updated ${freshness})` : "Pull fresh listing data from Redfin"}
        >
          <RefreshIcon /> Refresh
        </button>
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
        <button
          className={`refresh-btn${refreshing ? " is-refreshing" : ""}`}
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          aria-label="Refresh listings"
          title="Refresh listings from Redfin"
        >
          <RefreshIcon />
        </button>
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
        <div className="user-menu">
          <button
            className={`user-avatar-btn${user ? "" : " user-avatar-btn--more"}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {avatar}
          </button>
          {authMode === "signed-in" && user && (
            <button className="user-signout" onClick={onSignOut} title="Sign out">
              Sign out
            </button>
          )}
        </div>
      </div>
      {menuOpen && createPortal(
        <>
          <div className="app-menu-backdrop" onClick={() => setMenuOpen(false)} />
          <div className="app-menu" role="menu" data-testid="app-menu">
            <div className="app-menu-head">
              {avatar}
              <div className="app-menu-who">
                <div className="app-menu-name">{user?.displayName ?? (authMode === "demo" ? "Demo mode" : "Guest")}</div>
                <div className="app-menu-sub">{user?.email ?? syncLabel}</div>
              </div>
              {user && (
                <span className="app-menu-sync">
                  <SyncBadge syncStatus={syncStatus} saveFailed={saveFailed} />
                  <span>{syncLabel}</span>
                </span>
              )}
            </div>
            <button className="app-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); void handleRefresh(); }} disabled={refreshing}>
              <span className="app-menu-icon"><RefreshIcon /></span>
              <span className="app-menu-item-text">
                Refresh listings
                <span className="app-menu-item-sub">{freshness ? `Redfin data updated ${freshness}` : "Pull the latest from Redfin"}</span>
              </span>
            </button>
            <button className="app-menu-item" role="menuitem" onClick={menuAction(onShowSummary)}>
              <span className="app-menu-icon">📝</span> Tour summary
            </button>
            {(page === "planner" || page === "priority") && (
              <button className="app-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); void handleShare(); }}>
                <span className="app-menu-icon">↗</span> Share this plan
              </button>
            )}
            <button className="app-menu-item" role="menuitem" onClick={() => { setMenuOpen(false); fileInputRef.current?.click(); }}>
              <span className="app-menu-icon">↑</span> Upload Redfin CSV
            </button>
            {hiddenCount > 0 && (
              <button className="app-menu-item" role="menuitem" onClick={menuAction(onRestoreHidden)}>
                <span className="app-menu-icon">↺</span> Restore {hiddenCount} hidden listing{hiddenCount === 1 ? "" : "s"}
              </button>
            )}
            <button className="app-menu-item" role="menuitem" onClick={onToggleTheme}>
              <span className="app-menu-icon">{theme === "dark" ? "☀" : "☾"}</span> {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {isAdmin && (
              <button className="app-menu-item" role="menuitem" onClick={menuAction(() => onNavigate("admin"))}>
                <span className="app-menu-icon">⚙</span> Admin
              </button>
            )}
            {isAdmin && (
              <button className="app-menu-item" role="menuitem" onClick={menuAction(() => onNavigate("design"))}>
                <span className="app-menu-icon">◫</span> Design
              </button>
            )}
            {authMode === "signed-in" && (
              <button className="app-menu-item app-menu-item--danger" role="menuitem" onClick={menuAction(() => void onSignOut())}>
                <span className="app-menu-icon">⎋</span> Sign out
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </header>
  );
}
