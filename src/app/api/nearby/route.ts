import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { rateLimit } from "@/lib/homesync/rate-limit";
import { readJson } from "../_lib/http";
import { searchNearbyPlaces } from "./places";

export const dynamic = "force-dynamic";

const ALLOWED_RADIUS = new Set(["1", "3", "5", "10"]);

interface ResolvedTarget {
  lat: number;
  lng: number;
  homeLabel: string | null;
}

/**
 * Resolve the search origin: explicit lat/lng params win, otherwise the
 * family's saved home coordinates. Honest 404 when nothing is available.
 */
async function resolveTarget(
  familyId: string,
  latRaw: unknown,
  lngRaw: unknown
): Promise<{ target?: ResolvedTarget; error?: string }> {
  // NB: Number(null) is 0 — treat absent/empty params as "not provided".
  const lat = latRaw === null || latRaw === undefined || latRaw === "" ? NaN : Number(latRaw);
  const lng = lngRaw === null || lngRaw === undefined || lngRaw === "" ? NaN : Number(lngRaw);
  const hasCoordsParam = Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;

  const family = await db.family.findUnique({
    where: { id: familyId },
    select: { homeLat: true, homeLng: true, homeLabel: true },
  });

  if (hasCoordsParam) {
    return { target: { lat, lng, homeLabel: family?.homeLabel ?? null } };
  }
  if (family && typeof family.homeLat === "number" && typeof family.homeLng === "number") {
    return { target: { lat: family.homeLat, lng: family.homeLng, homeLabel: family.homeLabel } };
  }
  return {
    error:
      "No location to search around yet — set your home in Settings, or turn on location sharing first.",
  };
}

function parseParams(source: URLSearchParams | Record<string, unknown>) {
  const get = (k: string) => (source instanceof URLSearchParams ? source.get(k) : source[k]);
  const category = typeof get("category") === "string" ? String(get("category")).slice(0, 40) : null;
  const q = typeof get("q") === "string" ? String(get("q")) : null;
  const radiusRaw = get("radiusKm");
  const radiusStr = radiusRaw === null || radiusRaw === undefined ? "" : String(radiusRaw);
  const radiusKm = ALLOWED_RADIUS.has(radiusStr) ? Number(radiusStr) : null;
  return { category, q, radiusKm, latRaw: get("lat"), lngRaw: get("lng") };
}

/** Shared handler for GET (query params) and POST (JSON body). */
async function handle(
  familyId: string,
  params: ReturnType<typeof parseParams>
): Promise<NextResponse> {
  const { target, error } = await resolveTarget(familyId, params.latRaw, params.lngRaw);
  if (!target) {
    return NextResponse.json({ error: error ?? "No location available." }, { status: 404 });
  }

  try {
    const results = await searchNearbyPlaces({
      category: params.category,
      q: params.q,
      lat: target.lat,
      lng: target.lng,
      radiusKm: params.radiusKm,
      homeLabel: target.homeLabel,
    });
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Place search failed." },
      { status: 502 }
    );
  }
}

/** GET /api/nearby?category=&q=&lat=&lng=&radiusKm= — real place search results. */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const limited = rateLimit(`nearby:${ctx.user.id}`, 30, 5 * 60_000);
  if (limited) return limited;
  return handle(ctx.familyId, parseParams(req.nextUrl.searchParams));
}

/** POST /api/nearby — same search with a JSON body { category?, q?, lat?, lng?, radiusKm? }. */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const limited = rateLimit(`nearby:${ctx.user.id}`, 30, 5 * 60_000);
  if (limited) return limited;
  const body = await readJson(req);
  return handle(ctx.familyId, parseParams(body));
}
