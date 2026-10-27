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

/** GET /api/bills — due bills first (dueDate asc), then paid (paidAt desc). */
export async function GET() {
  try {
    await ensureSeed();
    const bills = await db.bill.findMany();
    bills.sort((a, b) => {
      const paidA = a.status === "paid" ? 1 : 0;
      const paidB = b.status === "paid" ? 1 : 0;
      if (paidA !== paidB) return paidA - paidB;
      if (paidA === 0) return a.dueDate.getTime() - b.dueDate.getTime();
      return (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0);
    });
    return NextResponse.json(bills);
  } catch (e) {
    console.error("GET /api/bills failed:", e);
    return NextResponse.json({ error: "Failed to load bills" }, { status: 500 });
  }
}

/** POST /api/bills — add a bill reminder. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: "amount must be a number greater than 0" }, { status: 400 });
    }
    if (typeof body.dueDate !== "string") {
      return NextResponse.json({ error: "dueDate is required" }, { status: 400 });
    }
    const dueDate = new Date(body.dueDate);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: "dueDate must be a valid ISO datetime" }, { status: 400 });
    }

    const created = await db.bill.create({
      data: {
        title: body.title.trim(),
        amount: body.amount,
        dueDate,
        category: typeof body.category === "string" && body.category ? body.category : "Other",
        payerId: typeof body.payerId === "string" ? body.payerId : null,
        recurring: typeof body.recurring === "string" ? body.recurring : null,
        currency: typeof body.currency === "string" && body.currency ? body.currency : "INR",
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/bills failed:", e);
    return NextResponse.json({ error: "Failed to create bill" }, { status: 500 });
  }
}

/** PATCH /api/bills — update partial fields; handles paid ↔ due transitions. */
export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.bill.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    const data: Prisma.BillUpdateInput = {};
    if (body.title !== undefined) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "title must be a non-empty string" }, { status: 400 });
      }
      data.title = body.title.trim();
    }
    if (typeof body.category === "string" && body.category) data.category = body.category;
    if (typeof body.amount === "number" && Number.isFinite(body.amount)) data.amount = body.amount;
    if (typeof body.currency === "string" && body.currency) data.currency = body.currency;
    if (body.dueDate === null) data.dueDate = existing.dueDate; // dueDate is required — ignore null
    else if (typeof body.dueDate === "string") {
      const d = new Date(body.dueDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "dueDate must be a valid ISO datetime" }, { status: 400 });
      }
      data.dueDate = d;
    }
    if (typeof body.status === "string" && body.status) data.status = body.status;
    if (body.payerId === null || typeof body.payerId === "string") data.payerId = body.payerId;
    if (body.recurring === null || typeof body.recurring === "string") data.recurring = body.recurring;

    // Reopening a bill clears its paid timestamp.
    if (data.status === "due") data.paidAt = null;

    let paidActor: string | null = null;
    if (data.status === "paid" && existing.status !== "paid") {
      if (!existing.paidAt) data.paidAt = new Date();
      const payerId = (typeof body.payerId === "string" ? body.payerId : undefined) ?? existing.payerId;
      const payer = payerId ? await db.member.findUnique({ where: { id: payerId } }) : null;
      paidActor = payer?.name ?? req.headers.get("X-HS-Actor") ?? "Family";
    }

    const updated = await db.bill.update({ where: { id }, data });

    if (paidActor) {
      await db.activityLog.create({
        data: { actor: paidActor, action: "marked bill paid", target: updated.title },
      });
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/bills failed:", e);
    return NextResponse.json({ error: "Failed to update bill" }, { status: 500 });
  }
}

/** DELETE /api/bills — remove a bill by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.bill.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

    await db.bill.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/bills failed:", e);
    return NextResponse.json({ error: "Failed to delete bill" }, { status: 500 });
  }
}
