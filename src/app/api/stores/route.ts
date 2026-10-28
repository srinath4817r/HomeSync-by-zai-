import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { searchNearbyPlaces } from "../nearby/places";

export const dynamic = "force-dynamic";

const ALLOWED_RADIUS = new Set(["1", "3", "5", "10"]);

/**
 * GET /api/stores?category=&q=&radiusKm=&lat=&lng= — legacy endpoint.
 *
 * Runs the SAME real place search as /api/nearby (shared cache) and reshapes
 * the results into the legacy `{ categories, stores, deprecated }` response
 * that the overview's "Nearby Stores" card still reads. Fields the search
 * cannot know (distance, ETA, rating, reviews, opening hours, phone) are
 * null / zero — never fabricated.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const sp = req.nextUrl.searchParams;
  const category = sp.get("category")?.slice(0, 40) ?? null;
  const q = sp.get("q");
  const radiusRaw = sp.get("radiusKm") ?? "";
  const radiusKm = ALLOWED_RADIUS.has(radiusRaw) ? Number(radiusRaw) : null;

  const latRaw = sp.get("lat");
  const lngRaw = sp.get("lng");
  // NB: Number(null) is 0 — treat absent/empty params as "not provided".
  const lat = latRaw === null || latRaw === "" ? NaN : Number(latRaw);
  const lng = lngRaw === null || lngRaw === "" ? NaN : Number(lngRaw);
  const hasCoordsParam =
    Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180;

  const family = await db.family.findUnique({
    where: { id: ctx.familyId },
    select: { homeLat: true, homeLng: true, homeLabel: true },
  });

  let origin: { lat: number; lng: number; homeLabel: string | null } | null = null;
  if (hasCoordsParam) {
    origin = { lat, lng, homeLabel: family?.homeLabel ?? null };
  } else if (family && typeof family.homeLat === "number" && typeof family.homeLng === "number") {
    origin = { lat: family.homeLat, lng: family.homeLng, homeLabel: family.homeLabel };
  } else {
    return NextResponse.json(
      { categories: [], stores: [], deprecated: true, error: "No home location is set yet." },
      { status: 404 }
    );
  }

  try {
    const results = await searchNearbyPlaces({
      category,
      q,
      lat: origin.lat,
      lng: origin.lng,
      radiusKm,
      homeLabel: origin.homeLabel,
    });
    return NextResponse.json({
      // Category counts would need one search per category — honest empty.
      categories: [],
      stores: results.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        // Unknown for web results — consumers must tolerate null and render nothing.
        distanceKm: null,
        etaMins: 0,
        rating: 0,
        reviews: 0,
        openNow: null,
        address: r.address,
        phone: null,
        snippet: r.snippet,
        link: r.link,
      })),
      deprecated: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Place search failed." },
      { status: 502 }
    );
  }
}
