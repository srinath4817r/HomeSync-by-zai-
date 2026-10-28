import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { logActivity } from "@/lib/homesync/server";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

function serialize(g: {
  id: string; name: string; quantity: string; category: string; status: string;
  priority: string; note: string | null; assigneeId: string | null;
  purchasedAt: Date | null; createdAt: Date;
}) {
  return {
    id: g.id,
    name: g.name,
    quantity: g.quantity,
    category: g.category,
    status: g.status,
    priority: g.priority,
    note: g.note,
    assigneeId: g.assigneeId,
    purchasedAt: g.purchasedAt?.toISOString() ?? null,
    createdAt: g.createdAt.toISOString(),
  };
}

/** GET /api/groceries — my family's shared grocery list. */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const items = await db.groceryItem.findMany({
    where: { familyId: ctx.familyId },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return NextResponse.json(items.map(serialize));
}

/** POST /api/groceries — add an item (addedBy attributed from session). */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: "Enter an item name." }, { status: 400 });

  const item = await db.groceryItem.create({
    data: {
      familyId: ctx.familyId,
      name,
      quantity: typeof body.quantity === "string" ? body.quantity.trim().slice(0, 30) : "",
      category: typeof body.category === "string" && body.category ? body.category.slice(0, 30) : "Other",
      priority: ["low", "medium", "high"].includes(String(body.priority)) ? String(body.priority) : "medium",
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null,
      assigneeId: typeof body.assigneeId === "string" && body.assigneeId ? body.assigneeId : null,
      addedById: ctx.user.id,
    },
  });
  await logActivity(ctx.familyId, ctx.user, "added to groceries", name);
  return NextResponse.json({ grocery: serialize(item) });
}

/** PATCH /api/groceries — edit / check off / reopen. Purchases recorded server-side. */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const item = await db.groceryItem.findUnique({ where: { id } });
  if (!item || item.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 80);
  if (typeof body.quantity === "string") data.quantity = body.quantity.trim().slice(0, 30);
  if (typeof body.category === "string" && body.category) data.category = body.category.slice(0, 30);
  if (["low", "medium", "high"].includes(String(body.priority))) data.priority = body.priority;
  if (typeof body.note === "string") data.note = body.note.trim().slice(0, 200) || null;
  if (body.assigneeId === null || typeof body.assigneeId === "string") {
    data.assigneeId = body.assigneeId || null;
  }
  if (["needed", "purchased", "skipped"].includes(String(body.status))) {
    data.status = body.status;
    data.purchasedAt = body.status === "purchased" ? new Date() : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await db.groceryItem.update({ where: { id }, data });
  if (data.status === "purchased") {
    await logActivity(ctx.familyId, ctx.user, "purchased", updated.name);
  }
  return NextResponse.json({ grocery: serialize(updated) });
}

/** DELETE /api/groceries */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const body = await readJson(req);
  const id = String(body.id ?? "");
  const item = await db.groceryItem.findUnique({ where: { id } });
  if (!item || item.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
  await db.groceryItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
