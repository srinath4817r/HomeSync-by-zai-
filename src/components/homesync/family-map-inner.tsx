"use client";

/**
 * Family map implementation (client-only — always loaded via next/dynamic
 * ssr:false from ./family-map).
 *
 * Tiles: OpenStreetMap (https://www.openstreetmap.org) — a real, free tile
 * provider with proper attribution shown on the map. No satellite imagery,
 * no API keys, no third-party branding beyond the required OSM credit.
 * Markers are custom glass divIcons with live pulse rings — no image assets.
 * Pins are rendered ONLY from real positions passed in by the caller.
 */

import { useEffect, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";
import type { MapPin } from "@/lib/homesync/types";
import type { FamilyMapProps } from "./family-map-data";

/* ---------------- marker icons (glass divIcons) ---------------- */

function memberIcon(pin: MapPin, active: boolean): L.DivIcon {
  const staleDot = pin.stale
    ? '<span class="hs-pin-stale" title="Location may be outdated"></span>'
    : "";
  const pulse = pin.sharing && !pin.stale ? '<span class="hs-pin-pulse"></span>' : "";
  return L.divIcon({
    className: "hs-pin-wrapper",
    html: `
      <div class="hs-pin member ${active ? "active" : ""}" style="--pin:${pin.color}">
        ${pulse}
        <span class="hs-pin-face">${pin.initials ?? "?"}</span>
        ${staleDot}
        <span class="hs-pin-tail"></span>
        <span class="hs-pin-name">${pin.label}</span>
      </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 30],
  });
}

function placeIcon(pin: MapPin, active: boolean): L.DivIcon {
  return L.divIcon({
    className: "hs-pin-wrapper",
    html: `
      <div class="hs-pin place ${active ? "active" : ""}" style="--pin:${pin.color}">
        <span class="hs-pin-dot"></span>
        <span class="hs-pin-chip">${pin.label}</span>
      </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/* ---------------- map behaviour helpers ---------------- */

function FitPins({ pins, activePinId }: { pins: MapPin[]; activePinId?: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (activePinId) {
      const p = pins.find((x) => x.id === activePinId);
      if (p) {
        map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
        return;
      }
    }
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.flyTo([pins[0].lat, pins[0].lng], 16, { duration: 0.8 });
      return;
    }
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
    map.flyToBounds(bounds.pad(0.28), { duration: 0.8, maxZoom: 16 });
  }, [pins, activePinId, map]);
  return null;
}

const OSM_TILES = {
  url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

export function FamilyMapInner({
  pins,
  className,
  activePinId,
  onPinClick,
  interactive = true,
  center,
  zoom = 15,
}: FamilyMapProps) {
  // computed once on mount — MapContainer center is uncontrolled after mount
  const [initialCenter] = useState<[number, number]>(() => {
    if (center) return center;
    if (pins.length > 0) return [pins[0].lat, pins[0].lng];
    return [20.5937, 78.9629]; // India overview — used only when nothing real is known
  });

  return (
    <div
      className={cn(
        "family-map relative overflow-hidden rounded-2xl border border-white/50 dark:border-white/10",
        className
      )}
    >
      <MapContainer
        center={initialCenter}
        zoom={zoom}
        minZoom={3}
        maxZoom={OSM_TILES.maxZoom}
        zoomControl={interactive}
        dragging={interactive}
        scrollWheelZoom={interactive}
        doubleClickZoom={interactive}
        touchZoom={interactive}
        keyboard={interactive}
        className="h-full w-full"
      >
        <TileLayer
          url={OSM_TILES.url}
          attribution={OSM_TILES.attribution}
          maxZoom={OSM_TILES.maxZoom}
          keepBuffer={4}
        />
        {interactive && <FitPins pins={pins} activePinId={activePinId} />}
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={
              pin.kind === "member"
                ? memberIcon(pin, pin.id === activePinId)
                : placeIcon(pin, pin.id === activePinId)
            }
            eventHandlers={{ click: () => onPinClick?.(pin) }}
            zIndexOffset={pin.kind === "member" ? 400 : 0}
          />
        ))}
      </MapContainer>
      {!interactive && <div className="absolute inset-0 z-[500] cursor-pointer" aria-hidden />}
    </div>
  );
}
