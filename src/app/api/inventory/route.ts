import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

function serialize(i: {
  id: string; name: string; quantity: number; unit: string; category: string;
  lowThreshold: number; updatedAt: Date;
}) {
  return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit,
    category: i.category,
    lowThreshold: i.lowThreshold,
    updatedAt: i.updatedAt.toISOString(),
  };
}

/** GET /api/inventory — my family's home inventory. */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const items = await db.inventoryItem.findMany({
    where: { familyId: ctx.familyId },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  return NextResponse.json(items.map(serialize));
}

/** POST /api/inventory */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Enter an item name." }, { status: 400 });
  const quantity = Number(body.quantity);
  const lowThreshold = Number(body.lowThreshold);

  const item = await db.inventoryItem.create({
    data: {
      familyId: ctx.familyId,
      name,
      quantity: Number.isFinite(quantity) ? Math.max(quantity, 0) : 0,
      unit: typeof body.unit === "string" && body.unit ? body.unit.slice(0, 12) : "pcs",
      category: typeof body.category === "string" && body.category ? body.category.slice(0, 30) : "Other",
      lowThreshold: Number.isFinite(lowThreshold) ? Math.max(lowThreshold, 0) : 0,
    },
  });
  return NextResponse.json({ item: serialize(item) });
}

/** PATCH /api/inventory */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const item = await db.inventoryItem.findUnique({ where: { id } });
  if (!item || item.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (Number.isFinite(Number(body.quantity))) data.quantity = Math.max(Number(body.quantity), 0);
  if (typeof body.unit === "string" && body.unit) data.unit = body.unit.slice(0, 12);
  if (typeof body.category === "string" && body.category) data.category = body.category.slice(0, 30);
  if (Number.isFinite(Number(body.lowThreshold))) data.lowThreshold = Math.max(Number(body.lowThreshold), 0);
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const updated = await db.inventoryItem.update({ where: { id }, data });
  return NextResponse.json({ item: serialize(updated) });
}

/** DELETE /api/inventory */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const body = await readJson(req);
  const id = String(body.id ?? "");
  const item = await db.inventoryItem.findUnique({ where: { id } });
  if (!item || item.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
  await db.inventoryItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
