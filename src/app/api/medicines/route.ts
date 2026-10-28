import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { logActivity } from "@/lib/homesync/server";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

function serialize(m: {
  id: string; memberId: string; caregiverId: string | null; name: string; dosage: string;
  timeLabel: string; instructions: string | null; status: string;
  scheduledAt: Date; actedAt: Date | null; actedBy: string | null; createdAt: Date;
}) {
  return {
    id: m.id,
    memberId: m.memberId,
    caregiverId: m.caregiverId,
    name: m.name,
    dosage: m.dosage,
    timeLabel: m.timeLabel,
    instructions: m.instructions,
    status: m.status,
    scheduledAt: m.scheduledAt.toISOString(),
    actedAt: m.actedAt?.toISOString() ?? null,
    actedBy: m.actedBy,
    createdAt: m.createdAt.toISOString(),
  };
}

/** GET /api/medicines?date=ISO — doses scheduled for a day (default: today, family timezone-agnostic). */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const dateParam = req.nextUrl.searchParams.get("date");
  const base = dateParam ? new Date(dateParam) : new Date();
  if (Number.isNaN(base.getTime())) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  const dayStart = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const medicines = await db.medicine.findMany({
    where: { familyId: ctx.familyId, scheduledAt: { gte: dayStart, lt: dayEnd } },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });
  return NextResponse.json(medicines.map(serialize));
}

/** POST /api/medicines — schedule a dose (real user-entered data only; AI never creates dosages). */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const name = String(body.name ?? "").trim().slice(0, 80);
  const memberId = String(body.memberId ?? "");
  const dosage = String(body.dosage ?? "").trim().slice(0, 40) || "1 dose";
  const timeLabel = String(body.timeLabel ?? "").trim().slice(0, 20);
  const scheduledAt = new Date(String(body.scheduledAt ?? ""));
  if (!name || !memberId || !timeLabel || Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Medicine needs a name, person, time and schedule." }, { status: 400 });
  }
  const person = await db.member.findUnique({ where: { id: memberId } });
  if (!person || person.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "That person is not part of your family." }, { status: 404 });
  }

  const medicine = await db.medicine.create({
    data: {
      familyId: ctx.familyId,
      memberId,
      caregiverId: typeof body.caregiverId === "string" && body.caregiverId ? body.caregiverId : null,
      name,
      dosage,
      timeLabel,
      instructions: typeof body.instructions === "string" && body.instructions.trim() ? body.instructions.trim().slice(0, 200) : null,
      scheduledAt,
    },
  });
  await logActivity(ctx.familyId, ctx.user, "scheduled medicine", `${name} for ${person.name}`);
  return NextResponse.json({ medicine: serialize(medicine) });
}

/**
 * PATCH /api/medicines — record dose actions (taken / skipped / acknowledged).
 * The actor is always the signed-in user from the session — never fabricated.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const medicine = await db.medicine.findUnique({ where: { id } });
  if (!medicine || medicine.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Medicine not found." }, { status: 404 });
  }

  const STATUSES = new Set(["scheduled", "taken", "skipped", "acknowledged"]);
  const status = String(body.status ?? "");
  if (!STATUSES.has(status)) {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }

  const updated = await db.medicine.update({
    where: { id },
    data: { status, actedAt: new Date(), actedBy: ctx.user.name },
  });
  const person = await db.member.findUnique({ where: { id: updated.memberId } });
  await logActivity(
    ctx.familyId,
    ctx.user,
    status === "taken" ? "confirmed medicine taken" : `marked dose ${status}`,
    `${updated.name} ${updated.timeLabel}${person ? ` • ${person.name}` : ""}`
  );
  return NextResponse.json({ medicine: serialize(updated) });
}

/** DELETE /api/medicines */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const body = await readJson(req);
  const id = String(body.id ?? "");
  const medicine = await db.medicine.findUnique({ where: { id } });
  if (!medicine || medicine.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Medicine not found." }, { status: 404 });
  }
  await db.medicine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
