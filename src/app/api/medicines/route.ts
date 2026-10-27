import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

const ACTIONS = ["take", "skip", "miss", "escalate", "acknowledge", "reset"] as const;
type MedicineAction = (typeof ACTIONS)[number];

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** Parse "H:MM AM/PM" (e.g. "8:00 AM", "6:30 pm") into 24h hours/minutes. */
function parseTimeLabel(label: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(label.trim());
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ap = match[3].toUpperCase();
  if (h < 1 || h > 12 || m > 59) return null;
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return { h, m };
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** GET /api/medicines?date=ISO — medicines scheduled on that date (or all), ordered scheduledAt asc. */
export async function GET(req: NextRequest) {
  try {
    await ensureSeed();
    const dateParam = req.nextUrl.searchParams.get("date");
    const where: { scheduledAt?: { gte: Date; lt: Date } } = {};
    if (dateParam) {
      const d = new Date(dateParam);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "date must be a valid ISO date" }, { status: 400 });
      }
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      where.scheduledAt = { gte: start, lt: end };
    }

    const medicines = await db.medicine.findMany({ where, orderBy: { scheduledAt: "asc" } });
    return NextResponse.json(medicines);
  } catch (e) {
    console.error("GET /api/medicines failed:", e);
    return NextResponse.json({ error: "Failed to load medicines" }, { status: 500 });
  }
}

/** POST /api/medicines — schedule a medicine dose. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof body.memberId !== "string" || !body.memberId) {
      return NextResponse.json({ error: "memberId is required" }, { status: 400 });
    }
    const member = await db.member.findUnique({ where: { id: body.memberId } });
    if (!member) {
      return NextResponse.json({ error: "memberId must reference an existing member" }, { status: 400 });
    }

    const timeLabelIn = typeof body.timeLabel === "string" ? body.timeLabel.trim() : "";
    if (timeLabelIn && !parseTimeLabel(timeLabelIn)) {
      return NextResponse.json(
        { error: "timeLabel must look like \"8:00 AM\"" },
        { status: 400 }
      );
    }

    let scheduledAt: Date;
    if (typeof body.scheduledAt === "string" && body.scheduledAt) {
      scheduledAt = new Date(body.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        return NextResponse.json({ error: "scheduledAt must be a valid ISO datetime" }, { status: 400 });
      }
    } else {
      scheduledAt = new Date();
      const parsed = timeLabelIn ? parseTimeLabel(timeLabelIn) : null;
      if (parsed) scheduledAt.setHours(parsed.h, parsed.m, 0, 0);
    }

    const timeLabel = timeLabelIn || fmtTime(scheduledAt);

    const created = await db.medicine.create({
      data: {
        name: body.name.trim(),
        dosage: typeof body.dosage === "string" && body.dosage.trim() ? body.dosage.trim() : "1 dose",
        timeLabel,
        instructions: typeof body.instructions === "string" ? body.instructions : null,
        memberId: body.memberId,
        caregiverId: typeof body.caregiverId === "string" ? body.caregiverId : null,
        scheduledAt,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/medicines failed:", e);
    return NextResponse.json({ error: "Failed to create medicine" }, { status: 500 });
  }
}

/** PATCH /api/medicines — { id, action } state machine for dose confirmations. */
export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const action = body.action as MedicineAction;
    if (!ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `action must be one of: ${ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const existing = await db.medicine.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Medicine not found" }, { status: 404 });

    const target = `${existing.name} ${existing.timeLabel}`;

    switch (action) {
      case "take": {
        const member = await db.member.findUnique({ where: { id: existing.memberId } });
        const updated = await db.medicine.update({ where: { id }, data: { status: "taken" } });
        await db.activityLog.create({
          data: { actor: member?.name ?? req.headers.get("X-HS-Actor") ?? "Family", action: "confirmed medicine", target },
        });
        return NextResponse.json(updated);
      }
      case "skip": {
        const updated = await db.medicine.update({ where: { id }, data: { status: "skipped" } });
        return NextResponse.json(updated);
      }
      case "miss": {
        // Simulates "no response detected" from the elder.
        const updated = await db.medicine.update({
          where: { id },
          data: { status: "confirmation_pending" },
        });
        return NextResponse.json(updated);
      }
      case "escalate": {
        const updated = await db.medicine.update({
          where: { id },
          data: { status: "escalated", escalatedToId: existing.caregiverId ?? null },
        });
        await db.activityLog.create({
          data: { actor: "System", action: "escalated reminder to caregiver for", target },
        });
        return NextResponse.json(updated);
      }
      case "acknowledge": {
        // Caregiver acknowledgment ≠ medicine confirmed — status stays "acknowledged".
        const caregiver = existing.caregiverId
          ? await db.member.findUnique({ where: { id: existing.caregiverId } })
          : null;
        const updated = await db.medicine.update({
          where: { id },
          data: { status: "acknowledged" },
        });
        await db.activityLog.create({
          data: { actor: caregiver?.name ?? "Caregiver", action: "acknowledged alert for", target },
        });
        return NextResponse.json(updated);
      }
      case "reset": {
        const updated = await db.medicine.update({
          where: { id },
          data: { status: "scheduled", escalatedToId: null },
        });
        return NextResponse.json(updated);
      }
    }
  } catch (e) {
    console.error("PATCH /api/medicines failed:", e);
    return NextResponse.json({ error: "Failed to update medicine" }, { status: 500 });
  }
}

/** DELETE /api/medicines — remove a medicine by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.medicine.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Medicine not found" }, { status: 404 });

    await db.medicine.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/medicines failed:", e);
    return NextResponse.json({ error: "Failed to delete medicine" }, { status: 500 });
  }
}
