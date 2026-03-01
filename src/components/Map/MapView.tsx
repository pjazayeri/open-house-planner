import { useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import type { TimeSlotGroup } from "../../types";
import { SLOT_COLORS } from "../Sidebar/TimeSlotGroup";
import { formatPrice, formatBedsBaths, formatTimeRange } from "../../utils/formatters";
import "./MapView.css";

interface MapViewProps {
  timeSlotGroups: TimeSlotGroup[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onNavigate: (id: string) => void;
  onHover: (id: string | null) => void;
}

/** Create a numbered circle marker icon */
function createNumberedIcon(
  num: number,
  color: string,
  isActive: boolean
): L.DivIcon {
  const size = isActive ? 32 : 26;
  return L.divIcon({
    className: "numbered-marker",
    html: `<div style="
      width:${size}px;height:${size}px;
      background:${color};
      border:2px solid ${isActive ? "#fff" : "rgba(255,255,255,0.7)"};
      border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:${isActive ? 13 : 11}px;font-weight:700;
      box-shadow:${isActive ? "0 0 0 3px " + color + ",0 2px 8px rgba(0,0,0,0.3)" : "0 1px 4px rgba(0,0,0,0.3)"};
      transition:all 0.15s;
    ">${num}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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

export function MapView({
  timeSlotGroups,
  selectedId,
  hoveredId,
  onSelect,
  onNavigate,
  onHover,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);

  // Collect all coordinates for overlap detection
  const allCoords = useMemo(() => {
    return timeSlotGroups.flatMap((g) =>
      g.listings.map((l) => [l.lat, l.lng] as [number, number])
    );
  }, [timeSlotGroups]);

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

        {/* Markers */}
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
              return (
                <Marker
                  key={listing.id}
                  position={pos}
                  icon={createNumberedIcon(
                    listing.visitOrder!,
                    color,
                    isActive
                  )}
                  eventHandlers={{
                    click: () => onSelect(listing.id),
                    mouseover: () => onHover(listing.id),
                    mouseout: () => onHover(null),
                  }}
                >
                  <Popup>
                    <div className="marker-popup">
                      <strong>#{listing.visitOrder}</strong>{" "}
                      {listing.address}
                      <br />
                      {formatPrice(listing.price)} &middot;{" "}
                      {formatBedsBaths(listing.beds, listing.baths)}
                      <br />
                      <span className="popup-time">
                        {formatTimeRange(
                          listing.openHouseStart,
                          listing.openHouseEnd
                        )}
                      </span>
                      <br />
                      <button
                        className="popup-nav-btn"
                        onClick={() => onNavigate(listing.id)}
                      >
                        View in list →
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            });
          });
        })()}
      </MapContainer>
    </div>
  );
}
