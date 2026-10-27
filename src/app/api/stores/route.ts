import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

/** Fixed category presentation table (key → label). Icons are chosen client-side. */
const CATEGORY_META: Record<string, { label: string }> = {
  grocery: { label: "Grocery Shops" },
  supermarket: { label: "Supermarkets" },
  restaurant: { label: "Restaurants" },
  cafe: { label: "Cafés & Bakeries" },
  pharmacy: { label: "Pharmacies" },
  barber: { label: "Barbers" },
  salon: { label: "Hair & Beauty Salons" },
  stationery: { label: "Stationery Shops" },
  clinic: { label: "Clinics & Labs" },
  hardware: { label: "Hardware Stores" },
  laundry: { label: "Laundry Services" },
};

/** GET /api/stores?category=&radiusKm=&q= — filtered stores + category counts within radius. */
export async function GET(req: NextRequest) {
  try {
    await ensureSeed();
    const params = req.nextUrl.searchParams;
    const category = params.get("category") ?? "";
    const q = (params.get("q") ?? "").trim().toLowerCase();
    let radiusKm = Number.parseFloat(params.get("radiusKm") ?? "");
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) radiusKm = 5;

    const all = await db.store.findMany();
    const inRadius = all.filter((s) => s.distanceKm <= radiusKm);

    // Category counts computed WITHIN the radius, ignoring category/q filters.
    const counts = new Map<string, number>();
    for (const s of inRadius) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    const categories = [...counts.entries()]
      .map(([key, count]) => ({
        key,
        label: CATEGORY_META[key]?.label ?? key,
        count,
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    const stores = inRadius
      .filter((s) => (category ? s.category === category : true))
      .filter((s) => (q ? s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q) : true))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return NextResponse.json({ categories, stores });
  } catch (e) {
    console.error("GET /api/stores failed:", e);
    return NextResponse.json({ error: "Failed to load stores" }, { status: 500 });
  }
}
