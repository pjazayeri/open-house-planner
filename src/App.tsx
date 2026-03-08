import { useState, useEffect } from "react";
import { useListings } from "./hooks/useListings";
import { Header } from "./components/Header/Header";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { MapView } from "./components/Map/MapView";
import { SummaryModal } from "./components/Summary/SummaryModal";
import "./App.css";

type MobileTab = "map" | "list";

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function App() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const [showOnlyPriority, setShowOnlyPriority] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  // scrollTarget drives the post-tab-switch scroll; stored as state so
  // useEffect re-runs when it's set alongside a mobileTab change.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  const {
    loading,
    error,
    allListings,
    cities,
    selectedCity,
    setSelectedCity,
    timeSlotGroups,
    selectedId,
    setSelectedId,
    hoveredId,
    setHoveredId,
    hiddenCount,
    hideListing,
    clearHidden,
    priorityIds,
    togglePriority,
    visits,
    markVisited,
    setLiked,
    setNotes,
    clearVisit,
    geoPosition,
    nearbyId,
    geoWatching,
    geoError,
    startGeo,
    syncStatus,
    saveFailed,
  } = useListings();

  // After the sidebar becomes visible (mobileTab === "list") and a scroll
  // target is pending, use requestAnimationFrame to scroll. rAF fires after
  // the browser has completed layout for the newly-visible sidebar, which
  // means scrollIntoView reliably finds and scrolls to the right card.
  useEffect(() => {
    if (!scrollTarget || mobileTab !== "list") return;
    const id = scrollTarget;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`card-${id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setScrollTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget, mobileTab]);

  // Called from the map preview card's "View in list →" button.
  // This button lives in React's DOM (outside Leaflet), so no ghost-click.
  const navigateToListing = (id: string) => {
    setSelectedId(id);
    setScrollTarget(id);
    setMobileTab("list");
  };

  const visibleGroups = showOnlyPriority
    ? timeSlotGroups
        .map((g) => ({ ...g, listings: g.listings.filter((l) => priorityIds.has(l.id)) }))
        .filter((g) => g.listings.length > 0)
    : timeSlotGroups;

  if (syncStatus === "loading" || loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>{syncStatus === "loading" ? "Syncing from cloud\u2026" : "Loading listings\u2026"}</p>
      </div>
    );
  }

  if (syncStatus === "unconfigured") {
    return (
      <div className="error-screen">
        <h2>Cloud sync not configured</h2>
        <p>
          Set <code>VITE_JSONBIN_API_KEY</code> and <code>VITE_JSONBIN_BIN_ID</code> in{" "}
          GitHub repo Settings &rarr; Secrets and variables &rarr; Actions, then redeploy.
        </p>
        <p>For local dev, add these to <code>.env.local</code>.</p>
      </div>
    );
  }

  if (syncStatus === "error") {
    return (
      <div className="error-screen">
        <h2>Could not load data from cloud</h2>
        <p>Check your network connection or JSONBin credentials, then reload.</p>
        <button className="retry-btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-screen">
        <p>Error loading data: {error}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <Header
        cities={cities}
        selectedCity={selectedCity}
        onCityChange={setSelectedCity}
        timeSlotGroups={timeSlotGroups}
        totalListings={allListings.length}
        hiddenCount={hiddenCount}
        onRestoreHidden={clearHidden}
        syncStatus={syncStatus}
        saveFailed={saveFailed}
        onShowSummary={() => setShowSummary(true)}
      />
      <div className={`app-body show-${mobileTab}`}>
        <Sidebar
          timeSlotGroups={visibleGroups}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
          onHide={hideListing}
          priorityIds={priorityIds}
          onTogglePriority={togglePriority}
          showOnlyPriority={showOnlyPriority}
          onTogglePriorityFilter={() => setShowOnlyPriority((v) => !v)}
          visits={visits}
          nearbyId={nearbyId}
          geoWatching={geoWatching}
          geoError={geoError}
          onStartGeo={startGeo}
          onMarkVisited={markVisited}
          onSetLiked={setLiked}
          onSetNotes={setNotes}
          onClearVisit={clearVisit}
        />
        <MapView
          timeSlotGroups={visibleGroups}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onDeselect={() => setSelectedId(null)}
          onNavigate={navigateToListing}
          onHover={setHoveredId}
          userPosition={geoPosition}
          geoWatching={geoWatching}
          onLocate={startGeo}
        />
      </div>
      <nav className="mobile-tab-bar">
        <button
          className={`tab-btn ${mobileTab === "map" ? "active" : ""}`}
          onClick={() => setMobileTab("map")}
        >
          <MapIcon />
          <span>Map</span>
        </button>
        <button
          className={`tab-btn ${mobileTab === "list" ? "active" : ""}`}
          onClick={() => setMobileTab("list")}
        >
          <ListIcon />
          <span>List</span>
        </button>
      </nav>
      {showSummary && (
        <SummaryModal
          allListings={allListings}
          visits={visits}
          priorityIds={priorityIds}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}

export default App;
