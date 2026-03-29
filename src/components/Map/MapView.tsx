import { useEffect, useRef, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Listing, TimeSlotGroup, VisitRecord, MapZone } from "../../types";
import { SLOT_COLORS } from "../Sidebar/TimeSlotGroup";
import { formatPrice, formatBedsBaths, formatTimeRange } from "../../utils/formatters";
import "./MapView.css";

const ZONE_COLORS = ["#ef4444", "#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#06b6d4"];

interface MapViewProps {
  timeSlotGroups: TimeSlotGroup[];
  selectedId: string | null;
  hoveredId: string | null;
  visits: Record<string, VisitRecord>;
  priorityOrder: string[];
  showRoute?: boolean;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onNavigate: (id: string) => void;
  onHover: (id: string | null) => void;
  userPosition: { lat: number; lng: number } | null;
  geoWatching: boolean;
  onLocate: () => void;
  // Zone management
  zones: MapZone[];
  selectedZoneId: string | null;
  onZoneSelect: (id: string) => void;
  onZoneCreate: (zone: MapZone) => void;
  onZoneUpdate: (id: string, polygon: [number, number][]) => void;
  onZoneRemove: (id: string) => void;
  onZoneRename: (id: string, name: string) => void;
}

/** "You are here" pulsing blue dot icon */
const userLocationIcon = L.divIcon({
  className: "user-location-marker",
  html: `<div class="user-dot"><div class="user-dot-pulse"></div></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

type VisitStatus = "unvisited" | "visited" | "liked" | "disliked";

/** Create a numbered circle marker icon with an optional visit-status badge */
function createNumberedIcon(
  num: number,
  color: string,
  isActive: boolean,
  status: VisitStatus
): L.DivIcon {
  const size = isActive ? 32 : 26;
  const badgeBase = `position:absolute;bottom:-3px;right:-3px;width:14px;height:14px;border-radius:50%;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;line-height:1;`;
  const badge =
    status === "liked"    ? `<div style="${badgeBase}background:#22c55e;color:#fff">✓</div>` :
    status === "disliked" ? `<div style="${badgeBase}background:#ef4444;color:#fff">✕</div>` :
    status === "visited"  ? `<div style="${badgeBase}background:#94a3b8;color:#fff;font-size:10px">·</div>` :
    "";
  return L.divIcon({
    className: "numbered-marker",
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="
        width:${size}px;height:${size}px;
        background:${color};
        border:2px solid ${isActive ? "#fff" : "rgba(255,255,255,0.7)"};
        border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        color:#fff;font-size:${isActive ? 13 : 11}px;font-weight:700;
        box-shadow:${isActive ? "0 0 0 3px " + color + ",0 2px 8px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.3)"};
      ">${num}</div>
      ${badge}
    </div>`,
    iconSize: [size + 3, size + 3],
    iconAnchor: [(size + 3) / 2, (size + 3) / 2],
  });
}

/** Slight offset for overlapping coordinates */
function offsetCoords(
  lat: number,
  lng: number,
  index: number,
  allCoords: [number, number][]
): [number, number] {
  const dupes = allCoords.filter(
    ([la, ln]) => Math.abs(la - lat) < 0.0001 && Math.abs(ln - lng) < 0.0001
  );
  if (dupes.length <= 1) return [lat, lng];
  const myIdx = dupes.findIndex(
    ([la, ln]) =>
      Math.abs(la - allCoords[index][0]) < 0.00001 &&
      Math.abs(ln - allCoords[index][1]) < 0.00001
  );
  const angle = (myIdx * 2 * Math.PI) / dupes.length;
  const offset = 0.0002;
  return [lat + offset * Math.sin(angle), lng + offset * Math.cos(angle)];
}

/** Fit map bounds when listings change */
function FitBounds({ timeSlotGroups }: { timeSlotGroups: TimeSlotGroup[] }) {
  const map = useMap();
  useEffect(() => {
    const allListings = timeSlotGroups.flatMap((g) => g.listings);
    if (allListings.length === 0) return;
    const bounds = L.latLngBounds(
      allListings.map((l) => [l.lat, l.lng] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [timeSlotGroups, map]);
  return null;
}

/** Pan to user location when first obtained */
function PanToUserPosition({
  userPosition,
}: {
  userPosition: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const prevPosition = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (userPosition && !prevPosition.current) {
      map.panTo([userPosition.lat, userPosition.lng], { animate: true });
    }
    prevPosition.current = userPosition;
  }, [userPosition, map]);
  return null;
}

/** Pan to selected marker */
function PanToSelected({
  timeSlotGroups,
  selectedId,
}: {
  timeSlotGroups: TimeSlotGroup[];
  selectedId: string | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedId) return;
    const listing = timeSlotGroups
      .flatMap((g) => g.listings)
      .find((l) => l.id === selectedId);
    if (listing) {
      map.panTo([listing.lat, listing.lng], { animate: true });
    }
  }, [selectedId, timeSlotGroups, map]);
  return null;
}

interface ZoneLayerProps {
  zones: MapZone[];
  selectedZoneId: string | null;
  editingZoneId: string | null;
  drawingMode: boolean;
  drawingPoints: [number, number][];
  onZoneSelect: (id: string) => void;
  onVertexDragEnd: (zoneId: string, newPolygon: [number, number][]) => void;
  onDrawVertex: (lat: number, lng: number) => void;
  onDrawFinish: () => void;
}

function ZoneLayer({
  zones,
  selectedZoneId,
  editingZoneId,
  drawingMode,
  drawingPoints,
  onZoneSelect,
  onVertexDragEnd,
  onDrawVertex,
  onDrawFinish,
}: ZoneLayerProps) {
  const map = useMap();

  // Stable refs for callbacks (avoids re-creating Leaflet layers on callback identity changes)
  const onZoneSelectRef = useRef(onZoneSelect);
  onZoneSelectRef.current = onZoneSelect;
  const onVertexDragEndRef = useRef(onVertexDragEnd);
  onVertexDragEndRef.current = onVertexDragEnd;
  const onDrawVertexRef = useRef(onDrawVertex);
  onDrawVertexRef.current = onDrawVertex;
  const onDrawFinishRef = useRef(onDrawFinish);
  onDrawFinishRef.current = onDrawFinish;

  // Zone polygon overlays (excluding the one being edited)
  useEffect(() => {
    const layers: L.Layer[] = [];

    for (const zone of zones) {
      if (zone.polygon.length < 3) continue;
      if (zone.id === editingZoneId) continue;

      const isSelected = zone.id === selectedZoneId;
      const poly = L.polygon(zone.polygon as L.LatLngExpression[], {
        color: zone.color,
        fillColor: zone.color,
        fillOpacity: isSelected ? 0.28 : 0.1,
        weight: isSelected ? 3 : 2,
        opacity: isSelected ? 1 : 0.65,
      });

      const capturedId = zone.id;
      poly.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onZoneSelectRef.current(capturedId);
      });

      poly.addTo(map);
      layers.push(poly);

      // Label at polygon centroid
      const center = poly.getBounds().getCenter();
      const label = L.marker(center, {
        icon: L.divIcon({
          className: "",
          html: `<div class="zone-label" style="border-color:${zone.color};color:${zone.color}">${zone.name}</div>`,
          iconSize: [0, 0] as L.PointTuple,
          iconAnchor: [0, 0] as L.PointTuple,
        }),
        interactive: false,
        zIndexOffset: -50,
      });
      label.addTo(map);
      layers.push(label);
    }

    return () => layers.forEach((l) => map.removeLayer(l));
  }, [zones, selectedZoneId, editingZoneId, map]);

  // Vertex drag handles for the zone being edited
  useEffect(() => {
    if (!editingZoneId) return;
    const zone = zones.find((z) => z.id === editingZoneId);
    if (!zone || zone.polygon.length < 3) return;

    // Mutable copy for live drag updates
    const livePts = zone.polygon.map((pt) => [...pt] as [number, number]);

    const editPoly = L.polygon(livePts as L.LatLngExpression[], {
      color: zone.color,
      fillColor: zone.color,
      fillOpacity: 0.15,
      weight: 2.5,
      dashArray: "6 4",
      opacity: 0.9,
    }).addTo(map);

    const handles = zone.polygon.map(([lat, lng], idx) => {
      const h = L.marker([lat, lng] as L.LatLngExpression, {
        icon: L.divIcon({
          className: "",
          html: `<div class="zone-vertex-dot" style="background:${zone.color};border-color:${zone.color}"></div>`,
          iconSize: [14, 14] as L.PointTuple,
          iconAnchor: [7, 7] as L.PointTuple,
        }),
        draggable: true,
        zIndexOffset: 500,
      });

      h.on("drag", (e) => {
        const ll = (e as L.LeafletMouseEvent).latlng;
        livePts[idx] = [ll.lat, ll.lng];
        editPoly.setLatLngs(livePts as L.LatLngExpression[]);
      });

      h.on("dragend", () => {
        onVertexDragEndRef.current(editingZoneId, [...livePts]);
      });

      return h.addTo(map);
    });

    return () => {
      map.removeLayer(editPoly);
      handles.forEach((h) => map.removeLayer(h));
    };
  }, [editingZoneId, zones, map]);

  // In-progress drawing polyline + vertex dots
  useEffect(() => {
    if (!drawingMode || drawingPoints.length === 0) return;
    const layers: L.Layer[] = [];

    if (drawingPoints.length >= 2) {
      layers.push(
        L.polyline(drawingPoints as L.LatLngExpression[], {
          color: "#7c3aed",
          weight: 2.5,
          dashArray: "6 4",
          opacity: 0.9,
        }).addTo(map)
      );
    }

    for (const [lat, lng] of drawingPoints) {
      layers.push(
        L.marker([lat, lng] as L.LatLngExpression, {
          icon: L.divIcon({
            className: "",
            html: `<div class="zone-vertex-dot" style="background:#7c3aed;border-color:#7c3aed"></div>`,
            iconSize: [10, 10] as L.PointTuple,
            iconAnchor: [5, 5] as L.PointTuple,
          }),
          interactive: false,
        }).addTo(map)
      );
    }

    return () => layers.forEach((l) => map.removeLayer(l));
  }, [drawingMode, drawingPoints, map]);

  // Drawing mode: cursor + click/dblclick handlers
  useEffect(() => {
    if (!drawingMode) return;

    const container = map.getContainer();
    container.style.cursor = "crosshair";
    map.doubleClickZoom.disable();

    const handleClick = (e: L.LeafletMouseEvent) => {
      onDrawVertexRef.current(e.latlng.lat, e.latlng.lng);
    };

    const handleDblClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stop(e);
      onDrawFinishRef.current();
    };

    map.on("click", handleClick);
    map.on("dblclick", handleDblClick);

    return () => {
      container.style.cursor = "";
      map.doubleClickZoom.enable();
      map.off("click", handleClick);
      map.off("dblclick", handleDblClick);
    };
  }, [drawingMode, map]);

  return null;
}

/**
 * Preview card shown at the bottom of the map when a marker is selected.
 * Lives in React's DOM (outside Leaflet), so no touch-event ghost-click issues.
 */
function SelectedPreview({
  listing,
  onNavigate,
  onDismiss,
}: {
  listing: Listing;
  onNavigate: (id: string) => void;
  onDismiss: () => void;
}) {
  // Block pointer events for 350ms after mount to absorb the browser's
  // 300ms ghost-click that follows a touch tap on a map marker.
  const [interactive, setInteractive] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setInteractive(true), 350);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="map-selected-preview"
      style={interactive ? undefined : { pointerEvents: "none" }}
      onClick={() => onNavigate(listing.id)}
    >
      <button
        className="preview-dismiss"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
        aria-label="Close"
      >✕</button>
      <div className="preview-info">
        <div className="preview-address">
          <span className="preview-num">#{listing.visitOrder ?? '?'}</span>
          {listing.address}
        </div>
        <div className="preview-sub">
          {formatPrice(listing.price)} &middot; {formatBedsBaths(listing.beds, listing.baths)}
        </div>
        <div className="preview-time">
          {formatTimeRange(listing.openHouseStart, listing.openHouseEnd)}
        </div>
      </div>
      <span className="preview-nav-chevron">›</span>
    </div>
  );
}

export function MapView({
  timeSlotGroups,
  selectedId,
  hoveredId,
  visits,
  priorityOrder,
  showRoute = true,
  onSelect,
  onDeselect,
  onNavigate,
  onHover,
  userPosition,
  geoWatching,
  onLocate,
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneCreate,
  onZoneUpdate,
  onZoneRemove,
  onZoneRename,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Zone management local state
  const [showZonePanel, setShowZonePanel] = useState(false);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([]);
  const [pendingPolygon, setPendingPolygon] = useState<[number, number][] | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [renamingZoneId, setRenamingZoneId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function handleDrawVertex(lat: number, lng: number) {
    setDrawingPoints((prev) => [...prev, [lat, lng]]);
  }

  function handleDrawFinish() {
    if (drawingPoints.length < 3) return;
    setPendingPolygon([...drawingPoints]);
    setPendingName(`Zone ${zones.length + 1}`);
    setDrawingPoints([]);
    setDrawingMode(false);
  }

  function handleCancelDrawing() {
    setDrawingMode(false);
    setDrawingPoints([]);
  }

  function handleSaveZone() {
    if (!pendingPolygon || pendingName.trim() === "") return;
    const colorIdx = zones.length % ZONE_COLORS.length;
    onZoneCreate({
      id: `zone-${Date.now()}`,
      name: pendingName.trim(),
      color: ZONE_COLORS[colorIdx],
      polygon: pendingPolygon,
    });
    setPendingPolygon(null);
    setPendingName("");
  }

  function handleCancelPending() {
    setPendingPolygon(null);
    setPendingName("");
  }

  function handleStartRename(zone: MapZone) {
    setRenamingZoneId(zone.id);
    setRenameValue(zone.name);
  }

  function handleSaveRename() {
    if (renamingZoneId && renameValue.trim()) {
      onZoneRename(renamingZoneId, renameValue.trim());
    }
    setRenamingZoneId(null);
  }

  const allListings = useMemo(
    () => timeSlotGroups.flatMap((g) => g.listings),
    [timeSlotGroups]
  );

  const selectedListing = useMemo(
    () => (selectedId ? allListings.find((l) => l.id === selectedId) ?? null : null),
    [selectedId, allListings]
  );

  // Collect all coordinates for overlap detection
  const allCoords = useMemo(
    () => allListings.map((l) => [l.lat, l.lng] as [number, number]),
    [allListings]
  );

  // Build straight-line fallback coords (used while OSRM loads or if it fails)
  const fallbackRouteCoords = useMemo(() => {
    let coordIdx = 0;
    return timeSlotGroups.flatMap((g) =>
      g.listings.map((l) => {
        const pos = offsetCoords(l.lat, l.lng, coordIdx, allCoords);
        coordIdx++;
        return pos;
      })
    );
  }, [timeSlotGroups, allCoords]);

  // OSRM street-following route
  const [osrmRoute, setOsrmRoute] = useState<[number, number][] | null>(null);

  useEffect(() => {
    if (allListings.length < 2) { setOsrmRoute(null); return; }

    const controller = new AbortController();

    // Route priority listings in priority order, then the rest in display order
    const byId = new Map(allListings.map((l) => [l.id, l]));
    const priorityListings = priorityOrder
      .map((id) => byId.get(id))
      .filter((l): l is typeof allListings[0] => l !== undefined);
    const prioritySet = new Set(priorityOrder);
    const others = allListings.filter((l) => !prioritySet.has(l.id));
    const ordered = priorityListings.length > 0 ? [...priorityListings, ...others] : allListings;
    const waypoints = ordered.slice(0, 25); // OSRM demo server cap

    const coordStr = waypoints.map((l) => `${l.lng},${l.lat}`).join(";");
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((data) => {
        const geom: [number, number][] | undefined = data.routes?.[0]?.geometry?.coordinates;
        if (geom) setOsrmRoute(geom.map(([lon, lat]) => [lat, lon]));
        else setOsrmRoute(null);
      })
      .catch((err) => { if (err.name !== "AbortError") setOsrmRoute(null); });

    return () => controller.abort();
  }, [allListings, priorityOrder]);

  const routeCoords = osrmRoute ?? fallbackRouteCoords;

  return (
    <div className="map-container">
      <MapContainer
        center={[37.79, -122.42]}
        zoom={13}
        className="leaflet-map"
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds timeSlotGroups={timeSlotGroups} />
        <PanToSelected
          timeSlotGroups={timeSlotGroups}
          selectedId={selectedId}
        />
        <PanToUserPosition userPosition={userPosition} />

        <ZoneLayer
          zones={zones}
          selectedZoneId={selectedZoneId}
          editingZoneId={editingZoneId}
          drawingMode={drawingMode}
          drawingPoints={drawingPoints}
          onZoneSelect={onZoneSelect}
          onVertexDragEnd={onZoneUpdate}
          onDrawVertex={handleDrawVertex}
          onDrawFinish={handleDrawFinish}
        />

        {/* Route polyline — white halo + blue line so it reads against any tile */}
        {showRoute && routeCoords.length > 1 && (
          <>
            <Polyline
              positions={routeCoords}
              pathOptions={osrmRoute
                ? { color: "#ffffff", weight: 7, opacity: 0.85 }
                : { color: "#ffffff", weight: 5, opacity: 0.6, dashArray: "10 7" }
              }
            />
            <Polyline
              positions={routeCoords}
              pathOptions={osrmRoute
                ? { color: "#2563eb", weight: 4, opacity: 0.9 }
                : { color: "#2563eb", weight: 2.5, opacity: 0.7, dashArray: "10 7" }
              }
            />
          </>
        )}
        {/* Directional arrows along the route */}
        {showRoute && routeCoords.length > 1 && (() => {
          const N = Math.min(8, Math.max(2, Math.floor(routeCoords.length / 12)));
          const step = Math.floor(routeCoords.length / (N + 1));
          return Array.from({ length: N }, (_, a) => {
            const i = step * (a + 1);
            // look slightly ahead for a stable bearing even on curved roads
            const j = Math.min(i + Math.max(2, Math.floor(step / 4)), routeCoords.length - 1);
            const [lat1, lng1] = routeCoords[i];
            const [lat2, lng2] = routeCoords[j];
            const angle = Math.atan2(lng2 - lng1, lat2 - lat1) * (180 / Math.PI);
            return (
              <Marker
                key={`arrow-${a}`}
                position={[lat1, lng1]}
                icon={L.divIcon({
                  className: "route-arrow-marker",
                  html: `<div style="transform:rotate(${angle}deg);color:#2563eb;font-size:18px;line-height:1;text-shadow:0 0 4px #fff,0 0 4px #fff">▲</div>`,
                  iconSize: [18, 18],
                  iconAnchor: [9, 9],
                })}
                interactive={false}
                zIndexOffset={-100}
              />
            );
          });
        })()}

        {/* User location dot */}
        {userPosition && (
          <Marker
            position={[userPosition.lat, userPosition.lng]}
            icon={userLocationIcon}
            zIndexOffset={1000}
          />
        )}

        {/* Markers — click selects only; navigation is via the preview card below */}
        {(() => {
          // Mirror the sidebar: only count priority IDs that are actually visible
          const visibleIds = new Set(timeSlotGroups.flatMap((g) => g.listings.map((l) => l.id)));
          const filteredPriorityOrder = priorityOrder.filter((id) => visibleIds.has(id));

          let coordIdx = 0;
          return timeSlotGroups.flatMap((group, groupIdx) => {
            const color = SLOT_COLORS[groupIdx % SLOT_COLORS.length];
            return group.listings.map((listing) => {
              const pos = offsetCoords(
                listing.lat,
                listing.lng,
                coordIdx,
                allCoords
              );
              coordIdx++;
              const isActive =
                listing.id === selectedId || listing.id === hoveredId;
              const visit = visits[listing.id];
              const visitStatus: VisitStatus =
                !visit ? "unvisited" :
                visit.liked === true ? "liked" :
                visit.liked === false ? "disliked" :
                "visited";
              const priorityIdx = filteredPriorityOrder.indexOf(listing.id);
              const markerNum = priorityIdx >= 0 ? priorityIdx + 1 : (listing.visitOrder ?? coordIdx);
              const markerColor = priorityIdx >= 0 ? "#f59e0b" : color;
              return (
                <Marker
                  key={`${listing.id}-${markerNum}`}
                  position={pos}
                  icon={createNumberedIcon(markerNum, markerColor, isActive, visitStatus)}
                  eventHandlers={{
                    click: () => onSelect(listing.id),
                    mouseover: () => onHover(listing.id),
                    mouseout: () => onHover(null),
                  }}
                />
              );
            });
          });
        })()}
      </MapContainer>

      {/* Zones button */}
      <button
        className={`zone-btn${showZonePanel ? " zone-btn--active" : ""}${selectedZoneId ? " zone-btn--filtered" : ""}`}
        onClick={() => {
          setShowZonePanel((v) => !v);
          if (showZonePanel) {
            setDrawingMode(false);
            setDrawingPoints([]);
            setPendingPolygon(null);
            setEditingZoneId(null);
          }
        }}
        aria-label="Manage zones"
        title="Zones"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 11 22 2 13 21 11 13 3 11" />
        </svg>
        {selectedZoneId && <span className="zone-btn-dot" />}
      </button>

      {/* Locate me button */}
      <button
        className={`locate-btn${geoWatching && userPosition ? " locate-btn--active" : ""}`}
        onClick={() => {
          if (userPosition && mapRef.current) {
            mapRef.current.panTo([userPosition.lat, userPosition.lng], { animate: true });
          }
          onLocate();
        }}
        aria-label="Show my location"
        title="Show my location"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          <circle cx="12" cy="12" r="8" />
        </svg>
      </button>

      {/* Zone panel */}
      {showZonePanel && (
        <div className="zone-panel">
          {pendingPolygon ? (
            /* Name new zone */
            <div className="zone-panel-section">
              <div className="zone-panel-title">Name this zone</div>
              <div className="zone-name-row">
                <input
                  className="zone-name-input"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  placeholder="Zone name…"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveZone(); if (e.key === "Escape") handleCancelPending(); }}
                />
                <button className="zone-action-btn zone-action-btn--save" onClick={handleSaveZone}>Save</button>
                <button className="zone-action-btn zone-action-btn--cancel" onClick={handleCancelPending}>✕</button>
              </div>
            </div>
          ) : drawingMode ? (
            /* Drawing in progress */
            <div className="zone-panel-section">
              <div className="zone-panel-title">
                {drawingPoints.length === 0
                  ? "Click map to add vertices"
                  : drawingPoints.length < 3
                  ? `${drawingPoints.length} point${drawingPoints.length > 1 ? "s" : ""} — need ${3 - drawingPoints.length} more`
                  : `${drawingPoints.length} points — double-click to finish`}
              </div>
              <div className="zone-draw-actions">
                {drawingPoints.length >= 3 && (
                  <button className="zone-action-btn zone-action-btn--save" onClick={handleDrawFinish}>✓ Finish</button>
                )}
                <button className="zone-action-btn zone-action-btn--cancel" onClick={handleCancelDrawing}>✕ Cancel</button>
              </div>
            </div>
          ) : (
            /* Zone list */
            <div className="zone-panel-section">
              {zones.length > 0 && (
                <div className="zone-list">
                  {zones.map((zone) => (
                    <div key={zone.id} className="zone-row">
                      {renamingZoneId === zone.id ? (
                        <input
                          className="zone-name-input zone-name-input--inline"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveRename(); if (e.key === "Escape") setRenamingZoneId(null); }}
                          onBlur={handleSaveRename}
                        />
                      ) : (
                        <button
                          className={`zone-chip${selectedZoneId === zone.id ? " zone-chip--active" : ""}`}
                          style={{ "--zone-color": zone.color } as React.CSSProperties}
                          onClick={() => onZoneSelect(zone.id)}
                          title="Click to filter by this zone"
                        >
                          <span className="zone-chip-dot" style={{ background: zone.color }} />
                          {zone.name}
                        </button>
                      )}
                      <div className="zone-row-actions">
                        <button
                          className={`zone-icon-btn${editingZoneId === zone.id ? " active" : ""}`}
                          title="Edit vertices"
                          onClick={() => setEditingZoneId(editingZoneId === zone.id ? null : zone.id)}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="zone-icon-btn"
                          title="Rename"
                          onClick={() => handleStartRename(zone)}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="4 7 4 4 20 4 20 7" />
                            <line x1="9" y1="20" x2="15" y2="20" />
                            <line x1="12" y1="4" x2="12" y2="20" />
                          </svg>
                        </button>
                        <button
                          className="zone-icon-btn zone-icon-btn--danger"
                          title="Delete zone"
                          onClick={() => {
                            onZoneRemove(zone.id);
                            if (editingZoneId === zone.id) setEditingZoneId(null);
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {editingZoneId && (
                <div className="zone-edit-hint">Drag vertex handles to reshape · <button className="zone-link-btn" onClick={() => setEditingZoneId(null)}>Done</button></div>
              )}
              <button
                className="zone-draw-btn"
                onClick={() => setDrawingMode(true)}
              >
                + Draw Zone
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selected listing preview — rendered in React DOM, not Leaflet, so no ghost-click issues */}
      {selectedListing && (
        <SelectedPreview
          key={selectedListing.id}
          listing={selectedListing}
          onNavigate={onNavigate}
          onDismiss={onDeselect}
        />
      )}
    </div>
  );
}
