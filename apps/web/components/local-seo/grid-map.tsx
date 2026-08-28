"use client";

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

export type GridMapPoint = {
  lat: number;
  lng: number;
  position: number | null;
  businessName: string | null;
};

// Green = top 3 (the real "map pack"), yellow = found but outside it, red =
// not found at all within the checked depth - the same three-tier reading
// every geo-grid rank tool (Local Falcon, BrightLocal, ProRankTracker) uses.
// Leaflet renders these as inline SVG stroke/fill styles, so we read the
// theme's success/warning/destructive tokens via CSS vars instead of Tailwind
// classes (which can't reach Leaflet's pathOptions) - keeps this in sync with
// the app's status-color tokens and dark mode automatically.
function markerColor(position: number | null): string {
  if (position === null) return "var(--destructive)";
  if (position <= 3) return "var(--success)";
  if (position <= 10) return "var(--warning)";
  return "var(--destructive)";
}

// Rendered only via next/dynamic({ ssr: false }) from grid-ranking-workspace.tsx
// - Leaflet touches `window` at module load, which breaks Next.js's
// server-side render pass of "use client" components (SSR still runs once
// for the initial HTML even for client components) if imported directly.
export function GridMap({ center, points }: { center: { lat: number; lng: number }; points: GridMapPoint[] }) {
  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} scrollWheelZoom={false} className="h-96 w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point, i) => (
        <CircleMarker
          key={i}
          center={[point.lat, point.lng]}
          radius={10}
          pathOptions={{ color: markerColor(point.position), fillColor: markerColor(point.position), fillOpacity: 0.85 }}
        >
          <Popup>
            {point.position !== null ? (
              <>
                Position <strong>{point.position}</strong>
                {point.businessName ? ` — ${point.businessName}` : ""}
              </>
            ) : (
              "Not found in results"
            )}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
