import { useEffect, useRef, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { Listing, TimeSlotGroup, VisitRecord } from "../../types";
import { SLOT_COLORS } from "../Sidebar/TimeSlotGroup";
import { formatPrice, formatBedsBaths, formatTimeRange } from "../../utils/formatters";
import "./MapView.css";

interface MapViewProps {
  timeSlotGroups: TimeSlotGroup[];
  selectedId: string | null;
  hoveredId: string | null;
  visits: Record<string, VisitRecord>;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onNavigate: (id: string) => void;
  onHover: (id: string | null) => void;
  userPosition: { lat: number; lng: number } | null;
  geoWatching: boolean;
  onLocate: () => void;
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
          <span className="preview-num">#{listing.visitOrder}</span>
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
  onSelect,
  onDeselect,
  onNavigate,
  onHover,
  userPosition,
  geoWatching,
  onLocate,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);

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

  // Build route polyline coordinates (all listings in visit order)
  const routeCoords = useMemo(() => {
    let coordIdx = 0;
    return timeSlotGroups.flatMap((g) =>
      g.listings.map((l) => {
        const pos = offsetCoords(l.lat, l.lng, coordIdx, allCoords);
        coordIdx++;
        return pos;
      })
    );
  }, [timeSlotGroups, allCoords]);

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

        {/* Route polyline */}
        {routeCoords.length > 1 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: "#475569",
              weight: 2,
              dashArray: "8 6",
              opacity: 0.6,
            }}
          />
        )}

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
              return (
                <Marker
                  key={listing.id}
                  position={pos}
                  icon={createNumberedIcon(
                    listing.visitOrder!,
                    color,
                    isActive,
                    visitStatus
                  )}
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
