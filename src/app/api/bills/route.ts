import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { logActivity } from "@/lib/homesync/server";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

function serialize(b: {
  id: string; title: string; category: string; amount: number; currency: string;
  dueDate: Date; status: string; recurring: string | null; paidAt: Date | null;
  payerId: string | null; createdAt: Date;
}) {
  return {
    id: b.id,
    title: b.title,
    category: b.category,
    amount: b.amount,
    currency: b.currency,
    dueDate: b.dueDate.toISOString(),
    status: b.status,
    recurring: b.recurring,
    paidAt: b.paidAt?.toISOString() ?? null,
    payerId: b.payerId,
    createdAt: b.createdAt.toISOString(),
  };
}

/** GET /api/bills — my family's bills. */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const bills = await db.bill.findMany({
    where: { familyId: ctx.familyId },
    orderBy: { dueDate: "asc" },
    take: 300,
  });
  return NextResponse.json(bills.map(serialize));
}

/** POST /api/bills */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const title = String(body.title ?? "").trim().slice(0, 120);
  const amount = Number(body.amount);
  const dueDate = new Date(String(body.dueDate ?? ""));
  if (!title || !Number.isFinite(amount) || amount < 0 || Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ error: "Bill needs a title, a valid amount and due date." }, { status: 400 });
  }

  const bill = await db.bill.create({
    data: {
      familyId: ctx.familyId,
      title,
      category: typeof body.category === "string" && body.category ? body.category.slice(0, 30) : "Other",
      amount,
      currency: typeof body.currency === "string" && body.currency ? body.currency.slice(0, 6) : "INR",
      dueDate,
      recurring: typeof body.recurring === "string" && body.recurring ? body.recurring : null,
      payerId: typeof body.payerId === "string" && body.payerId ? body.payerId : null,
      createdById: ctx.user.id,
    },
  });
  await logActivity(ctx.familyId, ctx.user, "added bill", title);
  return NextResponse.json({ bill: serialize(bill) });
}

/** PATCH /api/bills — edits + "mark paid" (records WHO marked it, never fakes a payment). */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const bill = await db.bill.findUnique({ where: { id } });
  if (!bill || bill.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 120);
  if (typeof body.category === "string" && body.category) data.category = body.category.slice(0, 30);
  if (Number.isFinite(Number(body.amount)) && Number(body.amount) >= 0) data.amount = Number(body.amount);
  if (typeof body.dueDate === "string") {
    const d = new Date(body.dueDate);
    if (!Number.isNaN(d.getTime())) data.dueDate = d;
  }
  if (["due", "paid"].includes(String(body.status))) {
    data.status = body.status;
    // "paid" = a household member records the payment; not a payment-provider confirmation.
    data.paidAt = body.status === "paid" ? new Date() : null;
  }
  if (body.payerId === null || typeof body.payerId === "string") data.payerId = body.payerId || null;
  if (typeof body.recurring === "string") data.recurring = body.recurring || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const updated = await db.bill.update({ where: { id }, data });
  if (data.status === "paid") {
    await logActivity(ctx.familyId, ctx.user, "marked bill paid", updated.title);
  }
  return NextResponse.json({ bill: serialize(updated) });
}

/** DELETE /api/bills */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const body = await readJson(req);
  const id = String(body.id ?? "");
  const bill = await db.bill.findUnique({ where: { id } });
  if (!bill || bill.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  }
  await db.bill.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
