// HOME SYNC — map data helpers (pure functions, safe for SSR — no leaflet imports)

import type { MapPin, Member, SavedPlace } from "@/lib/homesync/types";

export type MapStyle = "satellite" | "hybrid" | "streets";

/** Saved places with real coordinates around Lakeview Avenue, Chennai. */
export const SAVED_PLACES: SavedPlace[] = [
  { id: "place-home", label: "Home", sublabel: "24 Lakeview Avenue, Chennai", color: "#64748b", lat: 13.0904, lng: 80.2119 },
  { id: "place-school", label: "School", sublabel: "Lakeside Intl.", color: "#6f9a80", lat: 13.0782, lng: 80.2257 },
  { id: "place-office", label: "Office", sublabel: "T. Nagar", color: "#6889a8", lat: 13.0418, lng: 80.2341 },
  { id: "place-clinic", label: "Clinic", sublabel: "Apollo", color: "#9a8098", lat: 13.0637, lng: 80.253 },
  { id: "place-market", label: "Fresh Mart", sublabel: "Lakeview Road", color: "#a89462", lat: 13.0931, lng: 80.209 },
];

/** Map a member's location label prefix to the matching saved place coordinates. */
function placeForLabel(label: string | null): SavedPlace {
  const prefix = (label ?? "Home").split("•")[0]?.trim().split(" ")[0] ?? "Home";
  const direct = SAVED_PLACES.find((p) => p.label.toLowerCase() === prefix.toLowerCase());
  if (direct) return direct;
  if (/office|tech|park$/i.test(prefix)) return SAVED_PLACES[2];
  if (/school|sunrise/i.test(prefix)) return SAVED_PLACES[1];
  return SAVED_PLACES[0];
}

/** Build real-coordinate pins for members who consented to location sharing. */
export function memberPinsFrom(members: Member[]): MapPin[] {
  const offsets = [
    [0, 0],
    [0.0006, 0.0008],
    [-0.0007, 0.0006],
    [0.0008, -0.0007],
    [-0.0006, -0.0008],
    [0.0012, 0.0011],
  ];
  let i = 0;
  const pins: MapPin[] = [];
  for (const m of members) {
    if (!m.locationSharing) continue;
    const place = placeForLabel(m.locationLabel);
    const [dLat, dLng] = offsets[i % offsets.length];
    const stale = m.locationUpdatedAt
      ? Date.now() - new Date(m.locationUpdatedAt).getTime() > 45 * 60000
      : true;
    pins.push({
      id: `member-${m.id}`,
      kind: "member",
      label: m.name,
      sublabel: m.locationLabel ?? undefined,
      color: m.color,
      initials: m.name.slice(0, 2).toUpperCase(),
      lat: place.lat + dLat,
      lng: place.lng + dLng,
      stale,
      sharing: true,
    });
    i++;
  }
  return pins;
}

export function placePins(): MapPin[] {
  return SAVED_PLACES.map((p) => ({
    id: p.id,
    kind: "place" as const,
    label: p.label,
    sublabel: p.sublabel,
    color: p.color,
    lat: p.lat,
    lng: p.lng,
  }));
}
