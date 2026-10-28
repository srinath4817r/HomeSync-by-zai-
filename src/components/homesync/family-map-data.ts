// HOME SYNC — map data helpers (pure functions, safe for SSR — no leaflet imports)
// HONESTY RULE: pins come ONLY from real GPS pings (Member.lastPing) or real
// family home coordinates. Positions are never invented or offset.

import type { MapPin, Member, SavedPlace } from "@/lib/homesync/types";

/**
 * Kept for API compatibility with older consumers. All values now render the
 * same OpenStreetMap tiles — there is no satellite/hybrid imagery provider.
 */
export type MapStyle = "satellite" | "hybrid" | "streets";

/** Props for the family map component (SSR-safe — no leaflet types here). */
export interface FamilyMapProps {
  pins: MapPin[];
  className?: string;
  activePinId?: string | null;
  onPinClick?: (pin: MapPin) => void;
  interactive?: boolean;
  mapStyle?: MapStyle;
  center?: [number, number];
  zoom?: number;
}

/**
 * Saved places are NOT fabricated. The only honest entry is "Home", whose
 * coordinates are unknown (0,0 sentinel) until the family sets them in
 * Settings — placePins() skips entries without known coordinates.
 */
export const SAVED_PLACES: SavedPlace[] = [
  { id: "place-home", label: "Home", sublabel: "Set your address in Settings", color: "#64748b", lat: 0, lng: 0 },
];

function hasKnownCoords(p: { lat: number; lng: number }): boolean {
  return !(p.lat === 0 && p.lng === 0);
}

/**
 * Build map pins from REAL GPS pings only. Members without consent, or
 * without any recorded ping, produce NO pin — the map shows nothing rather
 * than an invented position.
 */
export function memberPinsFrom(members: Member[]): MapPin[] {
  const pins: MapPin[] = [];
  for (const m of members) {
    if (!m.locationSharing || !m.lastPing) continue;
    const capturedAt = m.lastPing.capturedAt;
    const stale = capturedAt
      ? Date.now() - new Date(capturedAt).getTime() > 45 * 60000
      : true;
    pins.push({
      id: `member-${m.id}`,
      kind: "member",
      label: m.name,
      sublabel: m.locationLabel ?? undefined,
      color: m.color,
      initials: m.name.slice(0, 2).toUpperCase(),
      lat: m.lastPing.lat,
      lng: m.lastPing.lng,
      stale,
      sharing: true,
    });
  }
  return pins;
}

/**
 * Pins for saved places — only those with real coordinates. Today that is
 * none until the family sets a home in Settings (SAVED_PLACES Home is a
 * placeholder without coordinates), so this returns an empty array.
 */
export function placePins(): MapPin[] {
  return SAVED_PLACES.filter(hasKnownCoords).map((p) => ({
    id: p.id,
    kind: "place" as const,
    label: p.label,
    sublabel: p.sublabel,
    color: p.color,
    lat: p.lat,
    lng: p.lng,
  }));
}
