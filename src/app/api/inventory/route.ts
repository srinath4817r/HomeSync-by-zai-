import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** GET /api/inventory — items ordered by name asc. */
export async function GET() {
  try {
    await ensureSeed();
    const items = await db.inventoryItem.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json(items);
  } catch (e) {
    console.error("GET /api/inventory failed:", e);
    return NextResponse.json({ error: "Failed to load inventory" }, { status: 500 });
  }
}

/** POST /api/inventory — add an inventory item. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity)) {
      return NextResponse.json({ error: "quantity must be a number" }, { status: 400 });
    }

    const created = await db.inventoryItem.create({
      data: {
        name: body.name.trim(),
        quantity: Math.max(0, body.quantity),
        unit: typeof body.unit === "string" && body.unit ? body.unit : "pcs",
        category: typeof body.category === "string" && body.category ? body.category : "Other",
        lowThreshold:
          typeof body.lowThreshold === "number" && Number.isFinite(body.lowThreshold)
            ? Math.max(0, body.lowThreshold)
            : 0,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/inventory failed:", e);
    return NextResponse.json({ error: "Failed to create inventory item" }, { status: 500 });
  }
}

/** PATCH /api/inventory — update partial fields (quantity clamped to >= 0). */
export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.inventoryItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

    const data: { name?: string; quantity?: number; unit?: string; category?: string; lowThreshold?: number } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.quantity === "number" && Number.isFinite(body.quantity)) {
      data.quantity = Math.max(0, body.quantity);
    }
    if (typeof body.unit === "string" && body.unit) data.unit = body.unit;
    if (typeof body.category === "string" && body.category) data.category = body.category;
    if (typeof body.lowThreshold === "number" && Number.isFinite(body.lowThreshold)) {
      data.lowThreshold = Math.max(0, body.lowThreshold);
    }

    const updated = await db.inventoryItem.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/inventory failed:", e);
    return NextResponse.json({ error: "Failed to update inventory item" }, { status: 500 });
  }
}

/** DELETE /api/inventory — remove an item by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.inventoryItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });

    await db.inventoryItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/inventory failed:", e);
    return NextResponse.json({ error: "Failed to delete inventory item" }, { status: 500 });
  }
}
