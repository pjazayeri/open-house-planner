import { useState, useEffect, useMemo } from "react";
import { useListings } from "./hooks/useListings";
import { Header } from "./components/Header/Header";
import { Sidebar, sortListings, matchesFilter } from "./components/Sidebar/Sidebar";
import { getNeighborhoods } from "./utils/filterListings";
import type { SortKey, FilterKey } from "./components/Sidebar/Sidebar";
const VALID_SORT_KEYS: SortKey[] = ["time", "price", "capRate", "ppsf"];
const VALID_FILTER_KEYS: FilterKey[] = ["liked", "disliked", "visited", "unvisited", "priority", "rated"];
import { MapView } from "./components/Map/MapView";
import { SummaryModal } from "./components/Summary/SummaryModal";
import { DataView } from "./components/DataView/DataView";
import { FinancePage } from "./components/Finance/FinancePage";
import { AnalyticsPage } from "./components/Analytics/AnalyticsPage";
import type { TimeSlotGroup } from "./types";
import "./App.css";

type MobileTab = "map" | "list";
export type Page = "home" | "planner" | "priority" | "data" | "finance" | "analytics";

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

const VALID_PAGES: Page[] = ["home", "planner", "priority", "data", "finance", "analytics"];

function pageFromHash(): Page {
  const hash = window.location.hash.slice(1).split("?")[0] as Page;
  return VALID_PAGES.includes(hash) ? hash : "home";
}

function idFromHash(): string | null {
  const h = window.location.hash.slice(1);
  const qi = h.indexOf("?");
  if (qi === -1) return null;
  return new URLSearchParams(h.slice(qi + 1)).get("id");
}

function hashParams(): URLSearchParams {
  const h = window.location.hash.slice(1);
  const qi = h.indexOf("?");
  return new URLSearchParams(qi === -1 ? "" : h.slice(qi + 1));
}

function filtersFromHash() {
  const p = hashParams();
  const sort = p.get("sort") as SortKey;
  const raw = p.get("f")?.split(",").filter((k): k is FilterKey => VALID_FILTER_KEYS.includes(k as FilterKey)) ?? [];
  return {
    sortKey: VALID_SORT_KEYS.includes(sort) ? sort : "time" as SortKey,
    activeFilters: new Set<FilterKey>(raw),
    searchQuery: p.get("q") ?? "",
    selectedNeighborhood: p.get("hood") ?? "",
    selectedDate: p.get("date") ?? "",
    timeFrom: p.has("from") ? Number(p.get("from")) : null,
    timeTo: p.has("to") ? Number(p.get("to")) : null,
  };
}

function buildFilterParams(
  sortKey: SortKey,
  activeFilters: Set<FilterKey>,
  searchQuery: string,
  selectedNeighborhood: string,
  selectedDate: string,
  timeFrom: number | null,
  timeTo: number | null,
): string {
  const p = new URLSearchParams();
  if (sortKey !== "time") p.set("sort", sortKey);
  if (activeFilters.size > 0) p.set("f", [...activeFilters].join(","));
  if (searchQuery) p.set("q", searchQuery);
  if (selectedNeighborhood) p.set("hood", selectedNeighborhood);
  if (selectedDate) p.set("date", selectedDate);
  if (timeFrom !== null) p.set("from", String(timeFrom));
  if (timeTo !== null) p.set("to", String(timeTo));
  return p.toString();
}

function App() {
  const [page, setPageState] = useState<Page>(pageFromHash);
  const [financeInitId, setFinanceInitId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const showOnlyPriority = page === "priority";

  // Initialize filter state from URL
  const _init = filtersFromHash();
  const [sortKey, setSortKey] = useState<SortKey>(_init.sortKey);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(_init.activeFilters);
  const [searchQuery, setSearchQuery] = useState(_init.searchQuery);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState(_init.selectedNeighborhood);
  const [selectedDate, setSelectedDate] = useState(_init.selectedDate);
  const [timeFrom, setTimeFrom] = useState<number | null>(_init.timeFrom);
  const [timeTo, setTimeTo] = useState<number | null>(_init.timeTo);

  // Keep hash in sync with page + filter state
  useEffect(() => {
    const params = buildFilterParams(sortKey, activeFilters, searchQuery, selectedNeighborhood, selectedDate, timeFrom, timeTo);
    const pageSlug = page === "home" ? "" : page;
    const full = pageSlug + (params ? "?" + params : "");
    const current = window.location.hash.slice(1).split("?")[0];
    const currentPage = page === "home" ? "" : page;
    if (current !== currentPage) {
      // Page changed → push a history entry
      window.location.hash = full;
    } else {
      // Filter-only change → replace so back button still works for page nav
      history.replaceState(null, "", "#" + full);
    }
  }, [page, sortKey, activeFilters, searchQuery, selectedNeighborhood, selectedDate, timeFrom, timeTo]);

  // Restore page + filters on browser back/forward
  useEffect(() => {
    function onHashChange() {
      setPageState(pageFromHash());
      const f = filtersFromHash();
      setSortKey(f.sortKey);
      setActiveFilters(f.activeFilters);
      setSearchQuery(f.searchQuery);
      setSelectedNeighborhood(f.selectedNeighborhood);
      setSelectedDate(f.selectedDate);
      setTimeFrom(f.timeFrom);
      setTimeTo(f.timeTo);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function setPage(p: Page) {
    setPageState(p);
  }
  const [showSummary, setShowSummary] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  const {
    loading,
    error,
    allListings,
    archivedListings,
    cities,
    selectedCity,
    setSelectedCity,
    timeSlotGroups,
    selectedId,
    setSelectedId,
    hoveredId,
    setHoveredId,
    hiddenIds,
    hiddenCount,
    hideListing,
    unhideListing,
    clearHidden,
    priorityIds,
    priorityOrder,
    togglePriority,
    reorderPriority,
    visits,
    markVisited,
    setLiked,
    setRating,
    setNoteField,
    toggleWantOffer,
    clearVisit,
    importData,
    uploadListings,
    geoPosition,
    nearbyId,
    geoWatching,
    geoError,
    startGeo,
    syncStatus,
    saveFailed,
  } = useListings();

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

  const navigateToListing = (id: string) => {
    setSelectedId(id);
    setScrollTarget(id);
    setMobileTab("list");
  };

  // Base groups differ by page:
  // - home: all non-hidden listings sorted by open house time, in one flat group
  // - planner: time-slot groups (optionally filtered to priority)
  const baseGroups = useMemo((): TimeSlotGroup[] => {
    if (page === "home") {
      const listings = allListings
        .filter((l) => !hiddenIds.has(l.id) && l.city === selectedCity)
        .sort((a, b) => a.openHouseStart.getTime() - b.openHouseStart.getTime());
      if (listings.length === 0) return [];
      return [{ label: "All Properties", startTime: new Date(0), endTime: new Date(0), listings }];
    }
    return showOnlyPriority
      ? timeSlotGroups
          .map((g) => ({ ...g, listings: g.listings.filter((l) => priorityIds.has(l.id)) }))
          .filter((g) => g.listings.length > 0)
      : timeSlotGroups;
  }, [page, allListings, hiddenIds, selectedCity, timeSlotGroups, priorityIds]);

  // Neighborhoods for the current city (derived from base listings before filtering)
  const neighborhoods = useMemo(
    () => getNeighborhoods(baseGroups.flatMap((g) => g.listings)),
    [baseGroups]
  );

  // Distinct dates available in the planner (from time slot groups)
  const availableDates = useMemo(() => {
    const seen = new Set<string>();
    const dates: { key: string; label: string }[] = [];
    for (const g of timeSlotGroups) {
      const key = g.startTime.toISOString().slice(0, 10);
      if (!seen.has(key)) {
        seen.add(key);
        dates.push({
          key,
          label: g.startTime.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }),
        });
      }
    }
    return dates;
  }, [timeSlotGroups]);

  // Reset neighborhood selection when city changes
  useEffect(() => { setSelectedNeighborhood(""); }, [selectedCity]);

  // Apply filters + sort on top of base groups (shared between home and planner)
  const visibleGroups = useMemo(() => {
    let groups = baseGroups;

    if (selectedNeighborhood) {
      groups = groups
        .map((g) => ({
          ...g,
          listings: g.listings.filter((l) => l.location === selectedNeighborhood),
        }))
        .filter((g) => g.listings.length > 0);
    }

    // Date + time range filters (planner only)
    if (page !== "home") {
      if (selectedDate) {
        groups = groups.filter(
          (g) => g.startTime.toISOString().slice(0, 10) === selectedDate
        );
      }
      if (timeFrom !== null || timeTo !== null) {
        groups = groups
          .map((g) => ({
            ...g,
            listings: g.listings.filter((l) => {
              const h = l.openHouseStart.getHours();
              if (timeFrom !== null && h < timeFrom) return false;
              if (timeTo !== null && h > timeTo) return false;
              return true;
            }),
          }))
          .filter((g) => g.listings.length > 0);
      }
    }

    if (activeFilters.size > 0) {
      groups = groups
        .map((g) => ({
          ...g,
          listings: g.listings.filter((l) =>
            [...activeFilters].some((f) => matchesFilter(l.id, f, visits, priorityIds))
          ),
        }))
        .filter((g) => g.listings.length > 0);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      groups = groups
        .map((g) => ({
          ...g,
          listings: g.listings.filter(
            (l) =>
              l.address.toLowerCase().includes(q) ||
              l.city.toLowerCase().includes(q) ||
              l.zip.toLowerCase().includes(q) ||
              l.id.toLowerCase().includes(q)
          ),
        }))
        .filter((g) => g.listings.length > 0);
    }

    if (sortKey !== "time") {
      groups = groups.map((g) => ({ ...g, listings: sortListings(g.listings, sortKey) }));
    }

    return groups;
  }, [baseGroups, page, selectedNeighborhood, selectedDate, timeFrom, timeTo, activeFilters, sortKey, visits, priorityIds, searchQuery]);

  const totalListings = useMemo(
    () => baseGroups.reduce((s, g) => s + g.listings.length, 0),
    [baseGroups]
  );

  if (syncStatus === "loading" || loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>{syncStatus === "loading" ? "Syncing from cloud\u2026" : "Loading listings\u2026"}</p>
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
        page={page}
        onNavigate={setPage}
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
        onUploadCsv={uploadListings}
      />
      {page === "analytics" && (
        <AnalyticsPage
          allListings={allListings}
          visits={visits}
          hiddenIds={hiddenIds}
          priorityIds={priorityIds}
        />
      )}
      {page === "finance" && (
        <FinancePage
          allListings={[...allListings, ...archivedListings]}
          visits={visits}
          priorityIds={priorityIds}
          hiddenIds={hiddenIds}
          initialSelectedId={financeInitId ?? idFromHash()}
        />
      )}
      {page === "data" && (
        <DataView
          allListings={[...allListings, ...archivedListings]}
          hiddenIds={hiddenIds}
          visits={visits}
          priorityIds={priorityIds}
          onHide={hideListing}
          onUnhide={unhideListing}
          onTogglePriority={togglePriority}
          onMarkVisited={markVisited}
          onSetLiked={setLiked}
          onSetRating={setRating}
          onToggleWantOffer={toggleWantOffer}
          onSetNoteField={setNoteField}
          onClearVisit={clearVisit}
          onImportCsv={importData}
          onOpenFinance={(id) => { setFinanceInitId(id); setPage("finance"); }}
          initialSelectedId={idFromHash()}
        />
      )}
      {page !== "analytics" && page !== "finance" && page !== "data" && (
      <>
      <div className={`app-body show-${mobileTab}`}>
        <Sidebar
          mode={page === "planner" || page === "priority" ? "planner" : "browse"}
          timeSlotGroups={visibleGroups}
          totalListings={totalListings}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
          onHide={hideListing}
          priorityIds={priorityIds}
          priorityOrder={priorityOrder}
          onTogglePriority={togglePriority}
          onReorderPriority={reorderPriority}
          showOnlyPriority={showOnlyPriority}
          onTogglePriorityFilter={() => setPage(page === "priority" ? "planner" : "priority")}
          sortKey={sortKey}
          onSortChange={setSortKey}
          activeFilters={activeFilters}
          onFiltersChange={setActiveFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          neighborhoods={neighborhoods}
          selectedNeighborhood={selectedNeighborhood}
          onNeighborhoodChange={setSelectedNeighborhood}
          availableDates={availableDates}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          timeFrom={timeFrom}
          timeTo={timeTo}
          onTimeFromChange={setTimeFrom}
          onTimeToChange={setTimeTo}
          visits={visits}
          nearbyId={nearbyId}
          geoWatching={geoWatching}
          geoError={geoError}
          onStartGeo={startGeo}
          onMarkVisited={markVisited}
          onSetLiked={setLiked}
          onSetRating={setRating}
          onToggleWantOffer={toggleWantOffer}
          onSetNoteField={setNoteField}
          onClearVisit={clearVisit}
          onOpenFinance={(id) => { setFinanceInitId(id); setPage("finance"); }}
        />
        <MapView
          timeSlotGroups={visibleGroups}
          selectedId={selectedId}
          hoveredId={hoveredId}
          visits={visits}
          priorityOrder={priorityOrder}
          showRoute={page !== "home"}
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
      </>
      )}
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
