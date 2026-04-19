import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import type { TimeSlotGroup } from "../../types";
import { formatPrice, formatBedsBaths, formatTimeRange } from "../../utils/formatters";
import "leaflet/dist/leaflet.css";

function makeIcon(label: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const SLOT_COLORS = ["#2563eb","#16a34a","#dc2626","#9333ea","#d97706","#0891b2","#be185d"];

function FitAll({ groups }: { groups: TimeSlotGroup[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const listings = groups.flatMap((g) => g.listings).filter((l) => l.lat && l.lng);
    if (listings.length === 0) return;
    map.fitBounds(L.latLngBounds(listings.map((l) => [l.lat, l.lng] as [number, number])), { padding: [40, 40] });
    fitted.current = true;
  }, [groups, map]);
  return null;
}

export function MapPlanView({ groups }: { groups: TimeSlotGroup[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const allListings = groups.flatMap((g, gi) =>
    g.listings.map((l, li) => ({ listing: l, groupIdx: gi, slotIdx: li + 1 }))
  );

  const active = activeId ? allListings.find((e) => e.listing.id === activeId) : null;

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", flexDirection: "column", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ padding: "10px 16px", background: "#1e293b", color: "#f1f5f9", display: "flex", alignItems: "center", gap: 12 }}>
        <strong style={{ fontSize: 15 }}>Open House Map</strong>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{allListings.length} properties</span>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <MapContainer
          center={[37.77, -122.42]}
          zoom={12}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <FitAll groups={groups} />
          {allListings.map(({ listing: l, groupIdx, slotIdx }) => {
            if (!l.lat || !l.lng) return null;
            const color = SLOT_COLORS[groupIdx % SLOT_COLORS.length];
            return (
              <Marker
                key={l.id}
                position={[l.lat, l.lng]}
                icon={makeIcon(String(slotIdx), color)}
                eventHandlers={{ click: () => setActiveId(l.id === activeId ? null : l.id) }}
              />
            );
          })}
        </MapContainer>

        {active && (
          <div style={{
            position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)",
            background: "#fff", borderRadius: 10, boxShadow: "0 4px 20px rgba(0,0,0,.18)",
            padding: "12px 16px", minWidth: 260, maxWidth: 340, zIndex: 1000,
          }}>
            <button
              onClick={() => setActiveId(null)}
              style={{ position: "absolute", top: 8, right: 10, background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#64748b" }}
            >✕</button>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{active.listing.address}</div>
            <div style={{ color: "#475569", fontSize: 13, marginBottom: 4 }}>
              {formatPrice(active.listing.price)} · {formatBedsBaths(active.listing.beds, active.listing.baths)}
              {active.listing.sqft ? ` · ${active.listing.sqft.toLocaleString()} sqft` : ""}
            </div>
            <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>
              {formatTimeRange(active.listing.openHouseStart, active.listing.openHouseEnd)}
            </div>
            <a
              href={active.listing.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: "#2563eb", textDecoration: "none" }}
            >
              View on Redfin ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
