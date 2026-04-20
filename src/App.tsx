import { useState, useEffect, useMemo, useCallback } from "react";
import { useListings } from "./hooks/useListings";
import { useMapZones } from "./hooks/useMapZones";
import { Header } from "./components/Header/Header";
import { Sidebar, sortListings, matchesFilter } from "./components/Sidebar/Sidebar";
import type { SortKey, FilterKey } from "./components/Sidebar/Sidebar";
const VALID_SORT_KEYS: SortKey[] = ["time", "price", "capRate", "ppsf"];
const VALID_FILTER_KEYS: FilterKey[] = ["liked", "disliked", "visited", "unvisited", "priority", "notPriority", "rated"];
import { MapView } from "./components/Map/MapView";
import { SummaryModal } from "./components/Summary/SummaryModal";
import { DataView } from "./components/DataView/DataView";
import { FinancePage } from "./components/Finance/FinancePage";
import { AnalyticsPage } from "./components/Analytics/AnalyticsPage";
import { serializePlan, decodePlan, deserializePlan } from "./utils/serializePlan";
import type { SerializedPlan } from "./utils/serializePlan";
import { PlanView } from "./components/PlanView/PlanView";
import { MapPlanView } from "./components/PlanView/MapPlanView";
import type { TimeSlotGroup, Listing } from "./types";
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

const VALID_STATUS_FILTERS = ["", "Active", "Pending", "Sold", "Contingent"];

function filtersFromHash() {
  const p = hashParams();
  const sort = p.get("sort") as SortKey;
  const raw = p.get("f")?.split(",").filter((k): k is FilterKey => VALID_FILTER_KEYS.includes(k as FilterKey)) ?? [];
  const statusRaw = p.get("status") ?? "Active";
  return {
    sortKey: VALID_SORT_KEYS.includes(sort) ? sort : "time" as SortKey,
    activeFilters: new Set<FilterKey>(raw),
    searchQuery: p.get("q") ?? "",
    selectedNeighborhoods: new Set<string>(p.get("hood")?.split(",").filter(Boolean) ?? []),
    selectedDate: p.get("date") ?? "",
    timeFrom: p.has("from") ? Number(p.get("from")) : null,
    timeTo: p.has("to") ? Number(p.get("to")) : null,
    statusFilter: VALID_STATUS_FILTERS.includes(statusRaw) ? statusRaw : "Active",
    priceMin: p.has("pmin") ? Number(p.get("pmin")) : null,
    priceMax: p.has("pmax") ? Number(p.get("pmax")) : null,
    capRateMin: p.has("crmin") ? Number(p.get("crmin")) : null,
    capRateMax: p.has("crmax") ? Number(p.get("crmax")) : null,
    ppsfMin: p.has("sfmin") ? Number(p.get("sfmin")) : null,
    ppsfMax: p.has("sfmax") ? Number(p.get("sfmax")) : null,
  };
}

function buildFilterParams(
  sortKey: SortKey,
  activeFilters: Set<FilterKey>,
  searchQuery: string,
  selectedAreas: Set<string>,
  selectedDate: string,
  timeFrom: number | null,
  timeTo: number | null,
  statusFilter: string,
  priceMin: number | null,
  priceMax: number | null,
  capRateMin: number | null,
  capRateMax: number | null,
  ppsfMin: number | null,
  ppsfMax: number | null,
): string {
  const p = new URLSearchParams();
  if (sortKey !== "time") p.set("sort", sortKey);
  if (activeFilters.size > 0) p.set("f", [...activeFilters].join(","));
  if (searchQuery) p.set("q", searchQuery);
  if (selectedAreas.size > 0) p.set("hood", [...selectedAreas].join(","));
  if (selectedDate) p.set("date", selectedDate);
  if (timeFrom !== null) p.set("from", String(timeFrom));
  if (timeTo !== null) p.set("to", String(timeTo));
  if (statusFilter !== "Active") p.set("status", statusFilter);
  if (priceMin !== null) p.set("pmin", String(priceMin));
  if (priceMax !== null) p.set("pmax", String(priceMax));
  if (capRateMin !== null) p.set("crmin", String(capRateMin));
  if (capRateMax !== null) p.set("crmax", String(capRateMax));
  if (ppsfMin !== null) p.set("sfmin", String(ppsfMin));
  if (ppsfMax !== null) p.set("sfmax", String(ppsfMax));
  return p.toString();
}

import { pointInPolygon } from "./utils/geometry";

function App() {
  // Shared plan view — decode from URL hash before anything else
  const [sharedPlan, setSharedPlan] = useState<TimeSlotGroup[] | null>(null);
  const [sharedPlanMode, setSharedPlanMode] = useState<"plan" | "map">("plan");
  const [sharedPlanLoading, setSharedPlanLoading] = useState(() => {
    const h = window.location.hash;
    return h.startsWith("#share?d=") || h.startsWith("#share?bin=") || h.startsWith("#map?bin=");
  });

  useEffect(() => {
    const hash = window.location.hash;
    const legacyPrefix = "#share?d=";
    const binPrefix = "#share?bin=";
    const mapPrefix = "#map?bin=";
    if (hash.startsWith(legacyPrefix)) {
      const plan = decodePlan(hash.slice(legacyPrefix.length));
      setSharedPlan(plan);
      setSharedPlanLoading(false);
    } else if (hash.startsWith(binPrefix) || hash.startsWith(mapPrefix)) {
      const isMap = hash.startsWith(mapPrefix);
      const id = hash.slice((isMap ? mapPrefix : binPrefix).length);
      if (isMap) setSharedPlanMode("map");
      fetch(`/api/plan?id=${id}`)
        .then((r) => r.ok ? r.json() : Promise.reject(r.status))
        .then((data: SerializedPlan) => setSharedPlan(deserializePlan(data)))
        .catch(() => setSharedPlan(null))
        .finally(() => setSharedPlanLoading(false));
    } else {
      setSharedPlanLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [page, setPageState] = useState<Page>(pageFromHash);
  const [financeInitId, setFinanceInitId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");
  const showOnlyPriority = page === "priority";

  // Initialize filter state from URL
  const _init = filtersFromHash();
  const [sortKey, setSortKey] = useState<SortKey>(_init.sortKey);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(_init.activeFilters);
  const [searchQuery, setSearchQuery] = useState(_init.searchQuery);
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(_init.selectedNeighborhoods);
  const [selectedDate, setSelectedDate] = useState(_init.selectedDate);
  const [timeFrom, setTimeFrom] = useState<number | null>(_init.timeFrom);
  const [timeTo, setTimeTo] = useState<number | null>(_init.timeTo);
  const [statusFilter, setStatusFilter] = useState(_init.statusFilter);
  const [priceMin, setPriceMin] = useState<number | null>(_init.priceMin);
  const [priceMax, setPriceMax] = useState<number | null>(_init.priceMax);
  const [capRateMin, setCapRateMin] = useState<number | null>(_init.capRateMin);
  const [capRateMax, setCapRateMax] = useState<number | null>(_init.capRateMax);
  const [ppsfMin, setPpsfMin] = useState<number | null>(_init.ppsfMin);
  const [ppsfMax, setPpsfMax] = useState<number | null>(_init.ppsfMax);

  function isSharedView(hash: string) {
    return hash.startsWith("#share") || hash.startsWith("#map?bin=");
  }

  // Keep hash in sync with page + filter state
  useEffect(() => {
    if (isSharedView(window.location.hash)) return;
    const params = buildFilterParams(sortKey, activeFilters, searchQuery, selectedAreas, selectedDate, timeFrom, timeTo, statusFilter, priceMin, priceMax, capRateMin, capRateMax, ppsfMin, ppsfMax);
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
  }, [page, sortKey, activeFilters, searchQuery, selectedAreas, selectedDate, timeFrom, timeTo, statusFilter, priceMin, priceMax, capRateMin, capRateMax, ppsfMin, ppsfMax]);

  // Restore page + filters on browser back/forward
  useEffect(() => {
    function onHashChange() {
      if (isSharedView(window.location.hash)) return;
      setPageState(pageFromHash());
      const f = filtersFromHash();
      setSortKey(f.sortKey);
      setActiveFilters(f.activeFilters);
      setSearchQuery(f.searchQuery);
      setSelectedAreas(f.selectedNeighborhoods);
      setSelectedDate(f.selectedDate);
      setTimeFrom(f.timeFrom);
      setTimeTo(f.timeTo);
      setStatusFilter(f.statusFilter);
      setPriceMin(f.priceMin);
      setPriceMax(f.priceMax);
      setCapRateMin(f.capRateMin);
      setCapRateMax(f.capRateMax);
      setPpsfMin(f.ppsfMin);
      setPpsfMax(f.ppsfMax);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function setPage(p: Page) {
    setPageState(p);
  }
  const [showSummary, setShowSummary] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);

  const { zones, addZone, updateZone, removeZone, renameZone } = useMapZones();

  const {
    loading,
    error,
    allListings,
    allFavoritesListings,
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
    skippedForDay,
    skipForDay,
    restoreSkippedForDay,
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
    finFavoriteIds,
    toggleFinFavorite,
    amenities,
    setAmenity,
  } = useListings();

  // Augment listings with zone names (replaces stripped SF District labels)
  const augmentWithZone = useCallback((l: Listing): Listing => {
    if (l.location || zones.length === 0) return l;
    const zone = zones.find((z) => z.polygon.length >= 3 && pointInPolygon(l.lat, l.lng, z.polygon));
    return zone ? { ...l, location: zone.name } : l;
  }, [zones]);

  const augmentedAllListings = useMemo(
    () => allListings.map(augmentWithZone),
    [allListings, augmentWithZone]
  );

  const augmentedArchivedListings = useMemo(
    () => archivedListings.map(augmentWithZone),
    [archivedListings, augmentWithZone]
  );

  const augmentedAllFavoritesListings = useMemo(
    () => allFavoritesListings.map(augmentWithZone),
    [allFavoritesListings, augmentWithZone]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of augmentedAllFavoritesListings) {
      if (l.city !== selectedCity || hiddenIds.has(l.id)) continue;
      const s = l.status ?? "Active";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [augmentedAllFavoritesListings, selectedCity, hiddenIds]);

  useEffect(() => {
    if (!scrollTarget) return;
    const isDesktop = window.innerWidth > 767;
    if (!isDesktop && mobileTab !== "list") return;
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
  //         + a "Past Visits" group for visited listings no longer in the active CSV
  // - planner: time-slot groups (optionally filtered to priority)
  const baseGroups = useMemo((): TimeSlotGroup[] => {
    if (page === "home") {
      const favIds = new Set(augmentedAllFavoritesListings.map((l) => l.id));
      const listings = augmentedAllFavoritesListings
        .filter((l) => {
          if (hiddenIds.has(l.id) || l.city !== selectedCity) return false;
          if (statusFilter && l.status !== statusFilter) return false;
          return true;
        })
        .sort((a, b) => {
          // Active listings: sort by open house time; others: sort by price descending
          if (a.openHouseStart.getTime() > 0 && b.openHouseStart.getTime() > 0)
            return a.openHouseStart.getTime() - b.openHouseStart.getTime();
          return b.price - a.price;
        });
      // Past Visits: visited archived listings not in the current CSV, shown for Active/All views
      const pastVisits = (!statusFilter || statusFilter === "Active")
        ? augmentedArchivedListings
            .filter((l) => !favIds.has(l.id) && !hiddenIds.has(l.id) && l.city === selectedCity && visits[l.id])
            .sort((a, b) => {
              const va = visits[a.id]?.visitedAt ?? "";
              const vb = visits[b.id]?.visitedAt ?? "";
              return vb.localeCompare(va);
            })
        : [];
      const groups: TimeSlotGroup[] = [];
      if (listings.length > 0) groups.push({ label: "All Properties", startTime: new Date(0), endTime: new Date(0), listings });
      if (pastVisits.length > 0) groups.push({ label: "Past Visits", startTime: new Date(0), endTime: new Date(0), listings: pastVisits });
      return groups;
    }
    const slotGroups = showOnlyPriority
      ? timeSlotGroups
          .map((g) => ({ ...g, listings: g.listings.filter((l) => priorityIds.has(l.id)) }))
          .filter((g) => g.listings.length > 0)
      : timeSlotGroups;
    return slotGroups.map((g) => ({ ...g, listings: g.listings.map(augmentWithZone) }));
  }, [page, augmentedAllFavoritesListings, augmentedArchivedListings, hiddenIds, selectedCity, statusFilter, timeSlotGroups, priorityIds, visits, showOnlyPriority, augmentWithZone]);

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

  // Reset area + status + range filters when city changes
  useEffect(() => {
    setSelectedAreas(new Set()); setStatusFilter("Active");
    setPriceMin(null); setPriceMax(null);
    setCapRateMin(null); setCapRateMax(null);
    setPpsfMin(null); setPpsfMax(null);
  }, [selectedCity]);

  // Apply filters + sort on top of base groups (shared between home and planner)
  const visibleGroups = useMemo(() => {
    let groups = baseGroups;

    if (selectedAreas.size > 0) {
      groups = groups
        .map((g) => ({
          ...g,
          listings: g.listings.filter((l) => {
            for (const area of selectedAreas) {
              const zone = zones.find((z) => z.id === area);
              if (zone && zone.polygon.length >= 3 && pointInPolygon(l.lat, l.lng, zone.polygon)) return true;
              if (l.location === area) return true;
            }
            return false;
          }),
        }))
        .filter((g) => g.listings.length > 0);
    }

    // Date + time range filters (planner only)
    if (page !== "home") {
      if (selectedDate) {
        groups = groups.filter(
          (g) => g.startTime.toISOString().slice(0, 10) === selectedDate
        );
        // Hide listings skipped for this specific day
        const skipped = new Set(skippedForDay[selectedDate] ?? []);
        if (skipped.size > 0) {
          groups = groups
            .map((g) => ({ ...g, listings: g.listings.filter((l) => !skipped.has(l.id)) }))
            .filter((g) => g.listings.length > 0);
        }
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
      const excludePriority = activeFilters.has("notPriority");
      const inclusionFilters = [...activeFilters].filter((f) => f !== "notPriority");
      groups = groups
        .map((g) => ({
          ...g,
          listings: g.listings.filter((l) => {
            if (excludePriority && priorityIds.has(l.id)) return false;
            if (inclusionFilters.length > 0) {
              return inclusionFilters.some((f) => matchesFilter(l.id, f, visits, priorityIds));
            }
            return true;
          }),
        }))
        .filter((g) => g.listings.length > 0);
    }

    if (priceMin !== null || priceMax !== null || capRateMin !== null || capRateMax !== null || ppsfMin !== null || ppsfMax !== null) {
      groups = groups
        .map((g) => ({
          ...g,
          listings: g.listings.filter((l) => {
            if (priceMin !== null && l.price < priceMin) return false;
            if (priceMax !== null && l.price > priceMax) return false;
            if (capRateMin !== null && l.capRate < capRateMin) return false;
            if (capRateMax !== null && l.capRate > capRateMax) return false;
            if (ppsfMin !== null && (l.pricePerSqft == null || l.pricePerSqft < ppsfMin)) return false;
            if (ppsfMax !== null && (l.pricePerSqft == null || l.pricePerSqft > ppsfMax)) return false;
            return true;
          }),
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
  }, [baseGroups, page, selectedAreas, zones, selectedDate, skippedForDay, timeFrom, timeTo, activeFilters, sortKey, visits, priorityIds, searchQuery, priceMin, priceMax, capRateMin, capRateMax, ppsfMin, ppsfMax]);

  const totalListings = useMemo(
    () => baseGroups.reduce((s, g) => s + g.listings.length, 0),
    [baseGroups]
  );

  // Render shared plan view (no auth / cloud state needed)
  if (sharedPlanLoading) return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <p>Loading plan\u2026</p>
    </div>
  );
  if (sharedPlan) return sharedPlanMode === "map"
    ? <MapPlanView groups={sharedPlan} />
    : <PlanView groups={sharedPlan} />;

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
        onSharePlan={async () => {
          const r = await fetch("/api/share", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(serializePlan(visibleGroups)),
          });
          if (!r.ok) throw new Error("Failed");
          const { id } = await r.json() as { id: string };
          const origin = window.location.origin;
          return {
            planUrl: `${origin}/#share?bin=${id}`,
            mapUrl: `${origin}/#map?bin=${id}`,
          };
        }}
      />
      {page === "analytics" && (
        <AnalyticsPage
          allListings={[...augmentedAllListings, ...augmentedArchivedListings.filter(a => !augmentedAllListings.some(l => l.id === a.id))]}
          visits={visits}
          hiddenIds={hiddenIds}
          priorityIds={priorityIds}
        />
      )}
      {page === "finance" && (
        <FinancePage
          allListings={[...augmentedAllListings, ...augmentedArchivedListings.filter(a => !augmentedAllListings.some(l => l.id === a.id))]}
          visits={visits}
          priorityIds={priorityIds}
          hiddenIds={hiddenIds}
          initialSelectedId={financeInitId ?? idFromHash()}
          finFavoriteIds={finFavoriteIds}
          toggleFinFavorite={toggleFinFavorite}
        />
      )}
      {page === "data" && (
        <DataView
          allListings={[...augmentedAllListings, ...augmentedArchivedListings.filter(a => !augmentedAllListings.some(l => l.id === a.id))]}
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
          onSkipForDay={(id) => selectedDate && skipForDay(id, selectedDate)}
          skippedTodayCount={selectedDate ? (skippedForDay[selectedDate]?.length ?? 0) : 0}
          onRestoreSkipped={() => selectedDate && restoreSkippedForDay(selectedDate)}
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
          selectedAreas={selectedAreas}
          onAreaChange={(area) => setSelectedAreas((prev) => {
            const next = new Set(prev);
            if (!area) { next.clear(); return next; }
            if (next.has(area)) next.delete(area); else next.add(area);
            return next;
          })}
          availableDates={availableDates}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
          priceMin={priceMin}
          priceMax={priceMax}
          onPriceMinChange={setPriceMin}
          onPriceMaxChange={setPriceMax}
          capRateMin={capRateMin}
          capRateMax={capRateMax}
          onCapRateMinChange={setCapRateMin}
          onCapRateMaxChange={setCapRateMax}
          ppsfMin={ppsfMin}
          ppsfMax={ppsfMax}
          onPpsfMinChange={setPpsfMin}
          onPpsfMaxChange={setPpsfMax}
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
          amenities={amenities}
          onSetAmenity={setAmenity}
          zones={zones}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          statusCounts={statusCounts}
        />
        <MapView
          timeSlotGroups={visibleGroups}
          selectedId={selectedId}
          hoveredId={hoveredId}
          visits={visits}
          priorityOrder={priorityOrder}
          showRoute={page !== "home"}
          onSelect={(id) => {
            setSelectedId(id);
            if (window.innerWidth > 767) setScrollTarget(id);
          }}
          onDeselect={() => setSelectedId(null)}
          onNavigate={navigateToListing}
          onHover={setHoveredId}
          userPosition={geoPosition}
          geoWatching={geoWatching}
          onLocate={startGeo}
          zones={zones}
          selectedZoneIds={new Set([...selectedAreas].filter((a) => zones.some((z) => z.id === a)))}
          onZoneSelect={(id) => setSelectedAreas((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          })}
          onZoneCreate={addZone}
          onZoneUpdate={updateZone}
          onZoneRemove={(id) => { removeZone(id); setSelectedAreas((prev) => { const next = new Set(prev); next.delete(id); return next; }); }}
          onZoneRename={renameZone}
          allListings={augmentedAllListings.filter(l => !hiddenIds.has(l.id) && l.city === selectedCity)}
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
