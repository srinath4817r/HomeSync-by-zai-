import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Apply partial grocery fields from a request body. */
function groceryFields(body: Record<string, unknown>): Prisma.GroceryItemUpdateInput {
  const data: Prisma.GroceryItemUpdateInput = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return data;
    data.name = body.name.trim();
  }
  if (typeof body.quantity === "string") data.quantity = body.quantity;
  if (typeof body.category === "string" && body.category) data.category = body.category;
  if (typeof body.status === "string" && body.status) data.status = body.status;
  if (typeof body.priority === "string" && body.priority) data.priority = body.priority;
  if (typeof body.note === "string" || body.note === null) data.note = body.note;
  if (body.assigneeId === null || typeof body.assigneeId === "string") data.assigneeId = body.assigneeId;
  if (typeof body.visibility === "string" && body.visibility) data.visibility = body.visibility;
  return data;
}

/** GET /api/groceries?status=&category= — ordered by createdAt asc. */
export async function GET(req: NextRequest) {
  try {
    await ensureSeed();
    const where: { status?: string; category?: string } = {};
    const status = req.nextUrl.searchParams.get("status");
    const category = req.nextUrl.searchParams.get("category");
    if (status) where.status = status;
    if (category) where.category = category;

    const groceries = await db.groceryItem.findMany({ where, orderBy: { createdAt: "asc" } });
    return NextResponse.json(groceries);
  } catch (e) {
    console.error("GET /api/groceries failed:", e);
    return NextResponse.json({ error: "Failed to load groceries" }, { status: 500 });
  }
}

/** POST /api/groceries — add a grocery item. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const created = await db.groceryItem.create({
      data: {
        name: body.name.trim(),
        quantity: typeof body.quantity === "string" ? body.quantity : "",
        category: typeof body.category === "string" && body.category ? body.category : "Other",
        priority: typeof body.priority === "string" && body.priority ? body.priority : "medium",
        assigneeId: typeof body.assigneeId === "string" ? body.assigneeId : null,
        note: typeof body.note === "string" ? body.note : null,
        visibility: typeof body.visibility === "string" && body.visibility ? body.visibility : "household",
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/groceries failed:", e);
    return NextResponse.json({ error: "Failed to create grocery item" }, { status: 500 });
  }
}

/** PATCH /api/groceries — update partial fields; logs activity when purchased. */
export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.groceryItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Grocery item not found" }, { status: 404 });

    const data = groceryFields(body);
    const updated = await db.groceryItem.update({ where: { id }, data });

    if (data.status === "purchased" && existing.status !== "purchased") {
      await db.activityLog.create({
        data: {
          actor: req.headers.get("X-HS-Actor") ?? "Family",
          action: "purchased",
          target: `${updated.name} ${updated.quantity}`.trim(),
        },
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/groceries failed:", e);
    return NextResponse.json({ error: "Failed to update grocery item" }, { status: 500 });
  }
}

/** DELETE /api/groceries — remove an item by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.groceryItem.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Grocery item not found" }, { status: 404 });

    await db.groceryItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/groceries failed:", e);
    return NextResponse.json({ error: "Failed to delete grocery item" }, { status: 500 });
  }
}
