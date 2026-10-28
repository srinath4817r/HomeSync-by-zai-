// HOME SYNC — real place search via the z-ai-web-dev-sdk `web_search` function.
// SERVER-ONLY (imports the SDK; never import this file from client code).
//
// How it works:
//   1. The family home coordinates are reverse-geocoded into a REAL place name
//      (locality / district / city / country) with the keyless Photon
//      (openstreetmap.org-based) reverse geocoder, cached in memory for 24 h.
//   2. That place name is used in a live web search ("best pharmacies in
//      Periamet, Chennai, India"). Bare coordinates confuse web search
//      engines, so the resolved locality is what makes results genuinely
//      local and real.
//
// Honesty rules: results carry ONLY fields the search actually returned —
// no fabricated addresses, distances, ratings or opening hours.

import ZAI from "z-ai-web-dev-sdk";

export interface NearbyResult {
  id: string;
  name: string;
  category: string;
  address: string | null; // web search carries no structured address — null today
  snippet: string | null; // real excerpt from the search result
  link: string | null; // real result URL
}

export interface NearbySearchParams {
  category?: string | null;
  q?: string | null;
  lat: number;
  lng: number;
  radiusKm?: number | null;
  homeLabel?: string | null;
}

export const NEARBY_CATEGORIES: Record<string, string> = {
  grocery: "grocery shops",
  supermarket: "supermarkets",
  restaurant: "restaurants",
  cafe: "cafes",
  pharmacy: "pharmacies",
  barber: "barbers",
  salon: "beauty salons",
  stationery: "stationery shops",
  clinic: "clinics",
  hardware: "hardware stores",
  laundry: "laundry services",
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "places";
  return NEARBY_CATEGORIES[category] ?? "places";
}

/* ---------- reverse geocoding (OSM-based, keyless, cached) ----------
 *
 * Web search engines need a real place NAME — bare coordinates confuse them.
 * Two keyless OpenStreetMap-based providers are tried in order and the first
 * usable answer wins:
 *   1. Nominatim (openstreetmap.org)
 *   2. Photon (photon.komoot.io)
 * Results are cached in memory for 24 h per rounded coordinate (failures are
 * retried after 5 min) so providers are hammered at most once per place.
 */

interface GeocodeHit {
  at: number;
  where: string | null;
}

const GEO_TTL_MS = 24 * 60 * 60 * 1000; // place names rarely change
const GEO_TTL_FAIL_MS = 5 * 60 * 1000; // retry provider outages sooner
const geoCache = new Map<string, GeocodeHit>();

function cleanPart(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+District$/i, "").trim() : "";
}

/** Join address parts into a compact "Locality, City, Country" label. */
function joinWhere(parts: string[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!p || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= 3) break; // locality + city + country is enough context
  }
  return out.length > 0 ? out.join(", ") : null;
}

function whereFromNominatim(address: Record<string, unknown>): string | null {
  return joinWhere([
    cleanPart(address.neighbourhood) || cleanPart(address.hamlet) || cleanPart(address.village),
    cleanPart(address.suburb) || cleanPart(address.city_district),
    cleanPart(address.city) || cleanPart(address.town) || cleanPart(address.county),
    cleanPart(address.country),
  ]);
}

function whereFromPhoton(props: Record<string, unknown>): string | null {
  return joinWhere([
    cleanPart(props.locality),
    cleanPart(props.district),
    cleanPart(props.city) || cleanPart(props.county),
    cleanPart(props.country),
  ]);
}

const UA = "HOME-SYNC/1.0 (family management app)";

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeNominatim(lat: number, lng: number): Promise<string | null> {
  const body = (await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`
  )) as { address?: Record<string, unknown> } | null;
  return body?.address ? whereFromNominatim(body.address) : null;
}

async function geocodePhoton(lat: number, lng: number): Promise<string | null> {
  const body = (await fetchJson(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`)) as {
    features?: Array<{ properties?: Record<string, unknown> }>;
  } | null;
  const props = body?.features?.[0]?.properties;
  return props ? whereFromPhoton(props) : null;
}

/**
 * Resolve a human-readable place name for coordinates: Nominatim → Photon →
 * the family's own home label → bare coordinates as a last resort.
 */
async function resolveWhere(
  lat: number,
  lng: number,
  homeLabel: string | null
): Promise<string> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = geoCache.get(key);
  if (hit) {
    const ttl = hit.where ? GEO_TTL_MS : GEO_TTL_FAIL_MS;
    if (Date.now() - hit.at < ttl) {
      if (hit.where) return hit.where;
    } else {
      geoCache.delete(key);
    }
  }
  const where =
    (await geocodeNominatim(lat, lng)) ??
    (await geocodePhoton(lat, lng)) ??
    (homeLabel?.trim() || null);
  geoCache.set(key, { at: Date.now(), where });
  if (where) return where;
  // Last resort — the search engine gets what we actually know.
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/* ---------- in-memory result cache: 10 minutes per query ---------- */

interface CacheEntry {
  at: number;
  data: NearbyResult[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 200;
const cache = new Map<string, CacheEntry>();

function cacheKey(p: NearbySearchParams): string {
  const lat = p.lat.toFixed(2);
  const lng = p.lng.toFixed(2);
  return [p.category ?? "", (p.q ?? "").trim().toLowerCase(), lat, lng, p.radiusKm ?? ""].join("|");
}

function cacheGet(key: string): NearbyResult[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.data;
}

function cachePut(key: string, data: NearbyResult[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), data });
}

/* ---------- SDK client (created once, reused) ---------- */

let zaiPromise: ReturnType<typeof ZAI.create> | null = null;

function getZai(): ReturnType<typeof ZAI.create> {
  if (!zaiPromise) {
    zaiPromise = ZAI.create();
  }
  return zaiPromise;
}

/* ---------- result shaping (no fabrication) ---------- */

const MAX_RESULTS = 10;

/** Strip common " - SiteName" / " | SiteName" title suffixes from a web result title. */
function cleanName(raw: string): string {
  const title = raw.trim();
  if (!title) return "";
  const cut = title.split(/\s+[-–|]\s+/)[0]?.trim() ?? "";
  return (cut || title).slice(0, 120).trim();
}

function toResults(
  items: Array<{ url?: string; name?: string; snippet?: string }>,
  category: string
): NearbyResult[] {
  const seen = new Set<string>();
  const results: NearbyResult[] = [];
  for (const item of items) {
    const name = cleanName(String(item.name ?? ""));
    const link = typeof item.url === "string" && item.url.startsWith("http") ? item.url : null;
    if (!name && !link) continue;
    const dedupeKey = `${name.toLowerCase()}|${link ?? ""}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const snippet = typeof item.snippet === "string" ? item.snippet.trim().slice(0, 300) : "";
    results.push({
      id: link ?? `result-${results.length}-${name.toLowerCase().replace(/\W+/g, "-").slice(0, 60)}`,
      name: name || link || "Result",
      category,
      // Web search results have no structured address / distance fields —
      // leave them null instead of inventing data.
      address: null,
      snippet: snippet || null,
      link,
    });
  }
  return results;
}

/* ---------- search ---------- */

/**
 * Run a real web search for places around the given coordinates. The
 * coordinates are reverse-geocoded into a real place name first — search
 * engines return genuinely local results for named places, not for numbers.
 */
export async function searchNearbyPlaces(p: NearbySearchParams): Promise<NearbyResult[]> {
  const key = cacheKey(p);
  const cached = cacheGet(key);
  if (cached) return cached;

  const where = await resolveWhere(p.lat, p.lng, p.homeLabel ?? null);
  const areaHint = p.radiusKm ? ` within ${p.radiusKm} km` : "";
  const q = String(p.q ?? "").trim().slice(0, 80);
  const category = p.category && NEARBY_CATEGORIES[p.category] ? p.category : null;
  const query = q
    ? `${q} in ${where}${areaHint}`
    : `best ${categoryLabel(category)} in ${where}${areaHint}`;

  const zai = await getZai();
  let items: Array<{ url?: string; name?: string; snippet?: string }>;
  try {
    items = await zai.functions.invoke("web_search", { query, num: MAX_RESULTS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[nearby] web_search failed:", msg);
    // The search backend answers 422 "No search results available" when a
    // query has zero matches — that is an honest EMPTY result, not a failure.
    if (/422|no search results/i.test(msg)) {
      const data: NearbyResult[] = [];
      cachePut(key, data);
      return data;
    }
    throw new Error("The place search service is unavailable right now. Try again shortly.");
  }
  if (!Array.isArray(items)) {
    throw new Error("The place search service returned an unexpected response. Try again shortly.");
  }

  const data = toResults(items, category ?? "place");
  cachePut(key, data);
  return data;
}

