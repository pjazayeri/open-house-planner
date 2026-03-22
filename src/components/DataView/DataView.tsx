import { useState, useRef, useEffect, useMemo } from "react";
import Papa from "papaparse";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Listing, VisitRecord } from "../../types";
import { formatPrice, formatBedsBaths } from "../../utils/formatters";
import { getCities, getNeighborhoods } from "../../utils/filterListings";
import "./DataView.css";

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;background:#3b82f6;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

type MapType = "street" | "satellite" | "light";

const TILE_LAYERS: Record<MapType, { url: string; label: string }> = {
  street: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    label: "Street",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    label: "Satellite",
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    label: "Light",
  },
};

/** Sits inside MapContainer — pans to new listing without remounting, syncs zoom from slider. */
function MapController({ lat, lng, zoom, onZoomChange }: {
  lat: number; lng: number; zoom: number; onZoomChange: (z: number) => void;
}) {
  const map = useMap();
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) map.panTo([lat, lng]);
    mounted.current = true;
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (map.getZoom() !== zoom) map.setZoom(zoom);
  }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({ zoomend: () => onZoomChange(map.getZoom()) });
  return null;
}

function MiniMap({ lat, lng, mapType, zoom, onZoomChange }: {
  lat: number; lng: number; mapType: MapType; zoom: number; onZoomChange: (z: number) => void;
}) {
  const tile = TILE_LAYERS[mapType];
  return (
    <div className="dv-map-panel-inner">
      <MapContainer
        center={[lat, lng]}
        zoom={zoom}
        zoomControl={false}
        attributionControl={false}
        scrollWheelZoom={false}
        className="dv-map-panel-leaflet"
      >
        <TileLayer key={mapType} url={tile.url} />
        <Marker position={[lat, lng]} icon={pinIcon} />
        <MapController lat={lat} lng={lng} zoom={zoom} onZoomChange={onZoomChange} />
      </MapContainer>
      <a
        className="dv-map-panel-link"
        href={`https://www.google.com/maps?q=${lat},${lng}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open in Google Maps ↗
      </a>
    </div>
  );
}

interface DataViewProps {
  allListings: Listing[];
  hiddenIds: Set<string>;
  visits: Record<string, VisitRecord>;
  priorityIds: Set<string>;
  onHide: (id: string) => void;
  onUnhide: (id: string) => void;
  onTogglePriority: (id: string) => void;
  onMarkVisited: (id: string) => void;
  onSetLiked: (id: string, liked: boolean | null) => void;
  onSetRating: (id: string, rating: number | null) => void;
  onToggleWantOffer: (id: string) => void;
  onSetNoteField: (id: string, field: "pros" | "cons", value: string) => void;
  onClearVisit: (id: string) => void;
  onOpenFinance: (id: string) => void;
  onImportCsv: (hiddenIds: string[], priorityIds: string[], visits: Record<string, VisitRecord>) => void;
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function fmtVisitTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const sync = () => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  };
  useEffect(sync, [props.value]);
  return (
    <textarea
      {...props}
      ref={ref}
      onInput={(e) => { sync(); props.onInput?.(e); }}
      style={{ ...props.style, resize: "none", overflow: "hidden" }}
    />
  );
}

interface DetailPanelProps {
  listing: Listing;
  isHidden: boolean;
  isPriority: boolean;
  visit: VisitRecord | null;
  onHide: () => void;
  onUnhide: () => void;
  onTogglePriority: () => void;
  onMarkVisited: () => void;
  onSetLiked: (liked: boolean | null) => void;
  onSetRating: (rating: number | null) => void;
  onToggleWantOffer: () => void;
  onSetNoteField: (field: "pros" | "cons", value: string) => void;
  onClearVisit: () => void;
  onOpenFinance: () => void;
}

function DetailPanel({
  listing: l,
  isHidden,
  isPriority,
  visit,
  onHide,
  onUnhide,
  onTogglePriority,
  onMarkVisited,
  onSetLiked,
  onSetRating,
  onToggleWantOffer,
  onSetNoteField,
  onClearVisit,
  onOpenFinance,
}: DetailPanelProps) {
  const [localPros, setLocalPros] = useState(visit?.pros ?? "");
  const [localCons, setLocalCons] = useState(visit?.cons ?? "");
  const [saved, setSaved] = useState(false);
  const [thumbError, setThumbError] = useState(false);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const handleSetLiked = (liked: boolean | null) => {
    if (!visit && liked !== null) onMarkVisited();
    onSetLiked(liked);
  };
  const handleSetRating = (rating: number | null) => {
    if (!visit && rating !== null) onMarkVisited();
    onSetRating(rating);
  };

  const panelClass = [
    "dv-detail",
    isPriority && !isHidden ? "dv-detail--priority" : "",
    visit?.liked === true ? "dv-detail--liked" : "",
    visit?.liked === false ? "dv-detail--disliked" : "",
    isHidden ? "dv-detail--hidden" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={panelClass}>
      <div className="dv-detail-main">
        <div className="dv-detail-thumb-wrap">
          {!thumbError ? (
            <img
              className="dv-detail-thumb"
              src={`/api/thumbnail/${l.id}`}
              alt={l.address}
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="dv-detail-thumb dv-detail-thumb-ph">🏠</div>
          )}
        </div>

        <div className="dv-detail-info">
          <div className="dv-detail-header">
            <a className="dv-detail-address" href={l.url} target="_blank" rel="noopener noreferrer">
              {l.address}
            </a>
            <span className="dv-detail-location">{l.location || l.city}{l.state ? `, ${l.state}` : ""}</span>
          </div>

          <div className="dv-detail-price-row">
            <span className="dv-detail-price">{formatPrice(l.price)}</span>
            <span className="dv-detail-beds">{formatBedsBaths(l.beds, l.baths)}</span>
            {l.sqft && <span className="dv-detail-sqft">{l.sqft.toLocaleString()} sqft</span>}
          </div>

          <div className="dv-detail-stats">
            {l.pricePerSqft != null && (
              <div className="dv-stat">
                <span className="dv-stat-label">$/sqft</span>
                <span className="dv-stat-val">{formatPrice(Math.round(l.pricePerSqft))}</span>
              </div>
            )}
            <div className="dv-stat">
              <span className="dv-stat-label">Cap Rate</span>
              <span className={`dv-stat-val dv-cap ${l.capRate >= 3.5 ? "good" : l.capRate >= 1.5 ? "ok" : "low"}`}>
                {l.capRate.toFixed(1)}%
              </span>
            </div>
            {l.yearBuilt != null && (
              <div className="dv-stat">
                <span className="dv-stat-label">Year Built</span>
                <span className="dv-stat-val">{l.yearBuilt}</span>
              </div>
            )}
            {l.daysOnMarket != null && (
              <div className="dv-stat">
                <span className="dv-stat-label">On Market</span>
                <span className="dv-stat-val">{l.daysOnMarket}d</span>
              </div>
            )}
            {l.hoa != null && (
              <div className="dv-stat">
                <span className="dv-stat-label">HOA/mo</span>
                <span className="dv-stat-val">{formatPrice(l.hoa)}</span>
              </div>
            )}
          </div>

          <div className="dv-detail-time">
            Open: {fmtDate(l.openHouseStart)} · {fmtTime(l.openHouseStart)}–{fmtTime(l.openHouseEnd)}
          </div>

          <div className="dv-detail-controls">
            <button
              className={`dv-btn dv-priority ${isPriority ? "active" : ""}`}
              title={isPriority ? "Remove from priority" : "Mark as priority"}
              onClick={onTogglePriority}
            >
              {isPriority ? "★" : "☆"}
            </button>

            {visit ? (
              <>
                <span className="dv-visited-time">{fmtVisitTime(visit.visitedAt)}</span>
                <button className="dv-btn dv-clear" title="Clear visit" onClick={onClearVisit}>✕ visit</button>
              </>
            ) : (
              <button className="dv-btn dv-visit" onClick={onMarkVisited}>Mark Visited</button>
            )}

            <div className="dv-thumbs">
              <button
                className={`dv-btn dv-thumb-btn ${visit?.liked === true ? "active-up" : ""}`}
                title="Liked it"
                onClick={() => handleSetLiked(visit?.liked === true ? null : true)}
              >👍</button>
              <button
                className={`dv-btn dv-thumb-btn ${visit?.liked === false ? "active-down" : ""}`}
                title="Didn't like it"
                onClick={() => handleSetLiked(visit?.liked === false ? null : false)}
              >👎</button>
            </div>

            <div className="dv-stars" onMouseLeave={() => setHoverRating(null)}>
              {[1, 2, 3, 4, 5].map((n) => {
                const filled = hoverRating !== null ? n <= hoverRating : visit?.rating != null && n <= visit.rating;
                return (
                  <button
                    key={n}
                    className={`dv-star ${filled ? "active" : ""}`}
                    onMouseEnter={() => setHoverRating(n)}
                    onClick={() => handleSetRating(visit?.rating === n ? null : n)}
                    title={`${n} star${n > 1 ? "s" : ""}`}
                  >
                    {filled ? "★" : "☆"}
                  </button>
                );
              })}
            </div>

            {visit && (
              <button
                className={`dv-btn dv-offer ${visit.wantOffer ? "active" : ""}`}
                title={visit.wantOffer ? "Remove offer interest" : "Want to put in an offer"}
                onClick={onToggleWantOffer}
              >
                🏠
              </button>
            )}

            <button className="dv-btn dv-finance" title="View finance breakdown" onClick={onOpenFinance}>$</button>

            <button
              className={`dv-btn dv-hide ${isHidden ? "is-hidden" : ""}`}
              title={isHidden ? "Restore listing" : "Hide listing"}
              onClick={isHidden ? onUnhide : onHide}
            >
              {isHidden ? "Restore" : "Hide"}
            </button>

            <a className="dv-btn dv-see-listing" href={l.url} target="_blank" rel="noopener noreferrer">
              See listing ↗
            </a>
          </div>
        </div>
      </div>

      <div className="dv-detail-notes">
        <div className="dv-notes-grid">
          <div className="dv-notes-field">
            <label className="dv-notes-label">Pros</label>
            <AutoTextarea
              className="dv-notes"
              placeholder="What did you like?"
              value={localPros}
              onChange={(e) => { setLocalPros(e.target.value); setSaved(false); }}
              onBlur={() => {
                onSetNoteField("pros", localPros);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
            />
          </div>
          <div className="dv-notes-field">
            <label className="dv-notes-label">Cons</label>
            <AutoTextarea
              className="dv-notes"
              placeholder="What didn't work?"
              value={localCons}
              onChange={(e) => { setLocalCons(e.target.value); setSaved(false); }}
              onBlur={() => {
                onSetNoteField("cons", localCons);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
              }}
            />
          </div>
        </div>
        {saved && <span className="dv-saved">Saved ✓</span>}
      </div>
    </div>
  );
}

type SortKey = "time" | "price" | "capRate" | "pricePerSqft" | "visited" | "rating";
type FilterKey = "all" | "visited" | "unvisited" | "liked" | "disliked" | "rated" | "unrated" | "highRated" | "priority" | "hidden" | "wantOffer";

const SORT_LABELS: Record<SortKey, string> = {
  time: "Time",
  price: "Price",
  capRate: "Cap Rate",
  pricePerSqft: "$/sqft",
  visited: "Visited",
  rating: "Rating",
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  visited: "Visited",
  unvisited: "Not Visited",
  liked: "👍 Liked",
  disliked: "👎 Disliked",
  rated: "★ Rated",
  unrated: "No Rating",
  highRated: "4–5 ★",
  priority: "Priority",
  hidden: "Hidden",
  wantOffer: "Want to Offer",
};

export function DataView({
  allListings,
  hiddenIds,
  visits,
  priorityIds,
  onHide,
  onUnhide,
  onTogglePriority,
  onMarkVisited,
  onSetLiked,
  onSetRating,
  onToggleWantOffer,
  onSetNoteField,
  onClearVisit,
  onOpenFinance,
  onImportCsv,
}: DataViewProps) {
  const cities = useMemo(() => getCities(allListings), [allListings]);
  const [selectedCity, setSelectedCity] = useState<string>("");
  // Keep selectedCity in sync when cities list changes
  useEffect(() => {
    if (cities.length > 0 && !cities.includes(selectedCity)) {
      setSelectedCity(cities[0]);
    }
  }, [cities, selectedCity]);

  const neighborhoods = useMemo(
    () => getNeighborhoods(allListings.filter((l) => !selectedCity || l.city === selectedCity)),
    [allListings, selectedCity]
  );

  // Reset neighborhood when city changes
  useEffect(() => { setSelectedNeighborhood(""); }, [selectedCity]);

  const [selectedNeighborhood, setSelectedNeighborhood] = useState("");
  const [mapType, setMapType] = useState<MapType>(() => {
    try { return (localStorage.getItem("dv-map-type") as MapType) ?? "street"; } catch { return "street"; }
  });
  const [mapZoom, setMapZoom] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("dv-map-zoom") ?? "14") || 14; } catch { return 14; }
  });
  function handleZoomChange(z: number) {
    setMapZoom(z);
    try { localStorage.setItem("dv-map-zoom", String(z)); } catch {}
  }
  const [sortKey, setSortKey] = useState<SortKey>("time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [visitDateFilter, setVisitDateFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const visitDates = useMemo(() => {
    const seen = new Set<string>();
    const dates: { key: string; label: string }[] = [];
    for (const v of Object.values(visits)) {
      const d = new Date(v.visitedAt);
      const key = d.toISOString().slice(0, 10);
      if (!seen.has(key)) {
        seen.add(key);
        dates.push({ key, label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) });
      }
    }
    return dates.sort((a, b) => a.key.localeCompare(b.key));
  }, [visits]);

  function handleImport(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const urlToId = new Map(allListings.map((l) => [l.url, l.id]));
        const newHiddenIds: string[] = [];
        const newPriorityIds: string[] = [];
        const newVisits: Record<string, VisitRecord> = {};
        let matched = 0;

        for (const row of result.data) {
          const id = urlToId.get(row["Redfin URL"]);
          if (!id) continue;
          matched++;
          if (row["Hidden"] === "yes") newHiddenIds.push(id);
          if (row["Priority"] === "yes") newPriorityIds.push(id);
          if (row["Visited"] === "yes") {
            const rating = parseInt(row["Stars (1-5)"] ?? "");
            const liked = row["Liked"] === "liked" ? true : row["Liked"] === "disliked" ? false : null;
            newVisits[id] = {
              visitedAt: row["Visited At"] ? new Date(row["Visited At"]).toISOString() : new Date().toISOString(),
              liked,
              rating: !isNaN(rating) && rating >= 1 && rating <= 5 ? rating : null,
              pros: row["Pros"] ?? "",
              cons: row["Cons"] ?? "",
              wantOffer: row["Want Offer"] === "yes",
            };
          }
        }

        onImportCsv(newHiddenIds, newPriorityIds, newVisits);
        setImportStatus(`Imported ${matched} of ${result.data.length} rows`);
        setTimeout(() => setImportStatus(null), 4000);
      },
      error: () => {
        setImportStatus("Import failed — invalid CSV");
        setTimeout(() => setImportStatus(null), 4000);
      },
    });
  }

  function toggleFilter(k: FilterKey) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    function matchesFilter(id: string, k: FilterKey): boolean {
      const v = visits[id];
      switch (k) {
        case "visited":   return !!v;
        case "unvisited": return !v;
        case "liked":     return v?.liked === true;
        case "disliked":  return v?.liked === false;
        case "rated":     return !!v && v.rating !== null;
        case "unrated":   return !!v && v.rating === null;
        case "highRated": return !!v && v.rating !== null && v.rating >= 4;
        case "priority":  return priorityIds.has(id);
        case "hidden":    return hiddenIds.has(id);
        case "wantOffer": return visits[id]?.wantOffer === true;
        default:          return true;
      }
    }

    const q = searchQuery.trim().toLowerCase();

    let filtered = allListings.filter((l) => {
      if (selectedCity && l.city !== selectedCity) return false;
      if (selectedNeighborhood && l.location !== selectedNeighborhood) return false;
      if (q) {
        const inAddress = l.address.toLowerCase().includes(q);
        const inCity = l.city.toLowerCase().includes(q);
        const inLocation = l.location.toLowerCase().includes(q);
        if (!inAddress && !inCity && !inLocation) return false;
      }
      if (activeFilters.size === 0) return true;
      for (const k of activeFilters) {
        if (matchesFilter(l.id, k)) return true;
      }
      return false;
    });

    if (visitDateFilter) {
      filtered = filtered.filter((l) => {
        const v = visits[l.id];
        if (!v) return false;
        return new Date(v.visitedAt).toISOString().slice(0, 10) === visitDateFilter;
      });
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortKey === "price")   return (a.price - b.price) * dir;
      if (sortKey === "capRate") return (b.capRate - a.capRate) * dir;
      if (sortKey === "pricePerSqft") {
        const aPsf = a.sqft ? a.price / a.sqft : Infinity;
        const bPsf = b.sqft ? b.price / b.sqft : Infinity;
        return (aPsf - bPsf) * dir;
      }
      if (sortKey === "visited") return ((visits[a.id] ? 0 : 1) - (visits[b.id] ? 0 : 1)) * dir;
      if (sortKey === "rating") {
        const ar = visits[a.id]?.rating ?? null;
        const br = visits[b.id]?.rating ?? null;
        if (ar === null && br === null) return 0;
        if (ar === null) return 1;
        if (br === null) return -1;
        return (br - ar) * dir;
      }
      return (a.openHouseStart.getTime() - b.openHouseStart.getTime()) * dir;
    });
  }, [allListings, selectedCity, selectedNeighborhood, searchQuery, activeFilters, visitDateFilter, visits, hiddenIds, priorityIds, sortKey, sortDir]);

  // Auto-select first item when sorted list changes
  useEffect(() => {
    if (sorted.length > 0 && (!selectedId || !sorted.some((l) => l.id === selectedId))) {
      setSelectedId(sorted[0].id);
    } else if (sorted.length === 0) {
      setSelectedId(null);
    }
  }, [sorted, selectedId]);

  // Arrow key navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "textarea" || tag === "input") return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!sorted.length) return;
      const idx = sorted.findIndex((l) => l.id === selectedId);
      const newIdx =
        e.key === "ArrowDown"
          ? idx === -1 ? 0 : Math.min(idx + 1, sorted.length - 1)
          : idx === -1 ? 0 : Math.max(idx - 1, 0);
      const newId = sorted[newIdx].id;
      setSelectedId(newId);
      rowRefs.current.get(newId)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sorted, selectedId]);

  const selectedListing = selectedId ? sorted.find((l) => l.id === selectedId) ?? null : null;

  const visitedCount = Object.keys(visits).length;
  const ratedCount = Object.values(visits).filter((v) => v.rating !== null).length;
  const highRatedCount = Object.values(visits).filter((v) => v.rating !== null && v.rating >= 4).length;

  function exportCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const headers = [
      "Address", "Price", "Beds", "Baths", "Sqft", "Cap Rate (%)",
      "Property Type", "Open House Date", "Open House Time",
      "Priority", "Hidden", "Visited", "Visited At", "Liked", "Stars (1-5)", "Want Offer",
      "Pros", "Cons", "Redfin URL",
    ];
    const rows = allListings
      .sort((a, b) => a.openHouseStart.getTime() - b.openHouseStart.getTime())
      .map((l) => {
        const v = visits[l.id];
        const likedStr = v ? (v.liked === true ? "liked" : v.liked === false ? "disliked" : "") : "";
        const ratingStr = v?.rating != null ? String(v.rating) : "";
        return [
          esc(l.address),
          l.price,
          l.beds,
          l.baths,
          l.sqft ?? "",
          l.capRate.toFixed(2),
          esc(l.propertyType),
          esc(l.openHouseStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })),
          esc(`${fmtTime(l.openHouseStart)}–${fmtTime(l.openHouseEnd)}`),
          priorityIds.has(l.id) ? "yes" : "no",
          hiddenIds.has(l.id) ? "yes" : "no",
          v ? "yes" : "no",
          v ? esc(new Date(v.visitedAt).toLocaleString()) : "",
          esc(likedStr),
          ratingStr,
          v?.wantOffer ? "yes" : "no",
          esc(v?.pros ?? ""),
          esc(v?.cons ?? ""),
          esc(l.url),
        ].join(",");
      });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `open-house-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dv-page">
      <div className="dv-header">
        <div className="dv-header-top">
          <input
            className="dv-search"
            type="text"
            placeholder="Search address or neighborhood…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="dv-header-stats">
            <span>{sorted.length}/{allListings.length} listings</span>
            {visitedCount > 0 && <><span>·</span><span>{visitedCount} visited</span></>}
            {ratedCount > 0 && <><span>·</span><span>{ratedCount} rated</span></>}
            {highRatedCount > 0 && <><span>·</span><span>{highRatedCount} ★4+</span></>}
          </div>
          <button className="dv-export" onClick={exportCsv}>Export CSV</button>
          <button className="dv-import" onClick={() => fileInputRef.current?.click()}>Import</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImport(file);
              e.target.value = "";
            }}
          />
          {importStatus && <span className="dv-import-status">{importStatus}</span>}
        </div>

        <div className="dv-header-bottom">
          {cities.length > 1 && (
            <div className="dv-control-row">
              <span className="dv-control-label">City</span>
              <select
                className="dv-filter-select"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                {cities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
          )}
          {neighborhoods.length > 1 && (
            <div className="dv-control-row">
              <span className="dv-control-label">Hood</span>
              <select
                className="dv-filter-select"
                value={selectedNeighborhood}
                onChange={(e) => setSelectedNeighborhood(e.target.value)}
              >
                <option value="">All neighborhoods</option>
                {neighborhoods.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
          <div className="dv-control-row">
            <span className="dv-control-label">Filter</span>
            <div className="dv-chips">
              {activeFilters.size > 0 && (
                <button className="dv-chip dv-chip-clear" onClick={() => setActiveFilters(new Set())}>Clear</button>
              )}
              {(Object.keys(FILTER_LABELS) as FilterKey[]).filter((k) => k !== "all").map((k) => (
                <button
                  key={k}
                  className={`dv-chip ${activeFilters.has(k) ? "active" : ""}`}
                  onClick={() => toggleFilter(k)}
                >
                  {FILTER_LABELS[k]}
                </button>
              ))}
              {visitDates.length >= 2 && visitDates.map(({ key, label }) => (
                <button
                  key={key}
                  className={`dv-chip${visitDateFilter === key ? " active" : ""}`}
                  onClick={() => setVisitDateFilter(visitDateFilter === key ? null : key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="dv-control-row">
            <span className="dv-control-label">Sort</span>
            <div className="dv-chips">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  className={`dv-chip ${sortKey === k ? "active" : ""}`}
                  onClick={() => handleSort(k)}
                >
                  {SORT_LABELS[k]}{sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="dv-body">
        <div className="dv-top">
          {selectedListing ? (
            <DetailPanel
              key={selectedId}
              listing={selectedListing}
              isHidden={hiddenIds.has(selectedListing.id)}
              isPriority={priorityIds.has(selectedListing.id)}
              visit={visits[selectedListing.id] ?? null}
              onHide={() => onHide(selectedListing.id)}
              onUnhide={() => onUnhide(selectedListing.id)}
              onTogglePriority={() => onTogglePriority(selectedListing.id)}
              onMarkVisited={() => onMarkVisited(selectedListing.id)}
              onSetLiked={(liked) => onSetLiked(selectedListing.id, liked)}
              onSetRating={(rating) => onSetRating(selectedListing.id, rating)}
              onToggleWantOffer={() => onToggleWantOffer(selectedListing.id)}
              onSetNoteField={(field, value) => onSetNoteField(selectedListing.id, field, value)}
              onClearVisit={() => onClearVisit(selectedListing.id)}
              onOpenFinance={() => onOpenFinance(selectedListing.id)}
            />
          ) : (
            <div className="dv-no-selection">No listings match.</div>
          )}
          <div className="dv-map-panel">
            <div className="dv-map-type-bar">
              {(Object.keys(TILE_LAYERS) as MapType[]).map((t) => (
                <button
                  key={t}
                  className={`dv-map-type-btn${mapType === t ? " active" : ""}`}
                  onClick={() => {
                    setMapType(t);
                    try { localStorage.setItem("dv-map-type", t); } catch {}
                  }}
                >
                  {TILE_LAYERS[t].label}
                </button>
              ))}
            </div>
            <div className="dv-zoom-bar">
              <span className="dv-zoom-label">{mapZoom}</span>
              <input
                type="range"
                min={10}
                max={18}
                value={mapZoom}
                onChange={(e) => handleZoomChange(parseInt(e.target.value))}
                className="dv-zoom-slider"
              />
            </div>
            {selectedListing ? (
              <MiniMap lat={selectedListing.lat} lng={selectedListing.lng} mapType={mapType} zoom={mapZoom} onZoomChange={handleZoomChange} />
            ) : (
              <div className="dv-map-panel-empty">Select a listing to see its location</div>
            )}
          </div>
        </div>

        <div className="dv-table-container">
          <div className="dv-table-header">
            <div className="dv-th dv-tc-badge" onClick={() => handleSort("visited")} title="Sort by visited" style={{ cursor: "pointer" }}>
              {sortKey === "visited" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </div>
            <div className="dv-th dv-tc-address dv-th--sortable" onClick={() => handleSort("time")}>
              Address{sortKey === "time" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </div>
            <div className="dv-th dv-tc-location">Location</div>
            <div className="dv-th dv-tc-price dv-th--sortable" onClick={() => handleSort("price")}>
              Price{sortKey === "price" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </div>
            <div className="dv-th dv-tc-beds">Bd</div>
            <div className="dv-th dv-tc-baths">Ba</div>
            <div className="dv-th dv-tc-sqft">Sqft</div>
            <div className="dv-th dv-tc-psf dv-th--sortable" onClick={() => handleSort("pricePerSqft")}>
              $/sqft{sortKey === "pricePerSqft" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </div>
            <div className="dv-th dv-tc-cap dv-th--sortable" onClick={() => handleSort("capRate")}>
              Cap%{sortKey === "capRate" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
            </div>
            <div className="dv-th dv-tc-mark dv-th--sortable" onClick={() => handleSort("rating")} title="Sort by rating">
              {sortKey === "rating" ? (sortDir === "asc" ? "↑" : "↓") : "★"}
            </div>
          </div>

          <div className="dv-table-body">
            {sorted.length === 0 && (
              <div className="dv-empty">No listings match this filter.</div>
            )}
            {sorted.map((l) => {
              const visit = visits[l.id];
              const isSelected = l.id === selectedId;
              const rowClass = [
                "dv-tr",
                isSelected ? "dv-tr--selected" : "",
                hiddenIds.has(l.id) ? "dv-tr--hidden" : "",
                visit?.liked === true ? "dv-tr--liked" : "",
                visit?.liked === false ? "dv-tr--disliked" : "",
                priorityIds.has(l.id) && !hiddenIds.has(l.id) ? "dv-tr--priority" : "",
              ].filter(Boolean).join(" ");

              return (
                <div
                  key={l.id}
                  ref={(el) => { if (el) rowRefs.current.set(l.id, el); else rowRefs.current.delete(l.id); }}
                  className={rowClass}
                  onClick={() => setSelectedId(l.id)}
                >
                  <div className="dv-tc dv-tc-badge">
                    {visit ? (
                      <span className="dv-badge dv-badge-visited">✓</span>
                    ) : (
                      <span className="dv-badge dv-badge-open">OPEN</span>
                    )}
                  </div>
                  <div className="dv-tc dv-tc-address">{l.address}</div>
                  <div className="dv-tc dv-tc-location">
                    <a
                      href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >{l.location || l.city}</a>
                  </div>
                  <div className="dv-tc dv-tc-price">{formatPrice(l.price)}</div>
                  <div className="dv-tc dv-tc-beds">{l.beds || "—"}</div>
                  <div className="dv-tc dv-tc-baths">{l.baths || "—"}</div>
                  <div className="dv-tc dv-tc-sqft">{l.sqft?.toLocaleString() ?? "—"}</div>
                  <div className="dv-tc dv-tc-psf">
                    {l.pricePerSqft ? `$${Math.round(l.pricePerSqft).toLocaleString()}` : "—"}
                  </div>
                  <div className={`dv-tc dv-tc-cap ${l.capRate >= 3.5 ? "good" : l.capRate >= 1.5 ? "ok" : "low"}`}>
                    {l.capRate.toFixed(1)}%
                  </div>
                  <div className="dv-tc dv-tc-mark">
                    {priorityIds.has(l.id) ? (
                      <span className="dv-row-star">★</span>
                    ) : visit?.liked === true ? (
                      <span className="dv-row-heart">♥</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
