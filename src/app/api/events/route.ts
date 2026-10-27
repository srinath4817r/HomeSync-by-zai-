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

/** Parse an optional ISO datetime field. Returns 400-worthy error message when invalid. */
function optionalDate(value: unknown, field: string): { date: Date | null; error: string | null } {
  if (value === undefined) return { date: undefined as unknown as Date, error: null };
  if (value === null) return { date: null, error: null };
  if (typeof value !== "string") return { date: null, error: `${field} must be an ISO datetime string` };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: null, error: `${field} must be a valid ISO datetime` };
  return { date: d, error: null };
}

/** Apply partial event fields from a request body. */
function eventFields(body: Record<string, unknown>): { data: Prisma.EventUpdateInput; error: string | null } {
  const data: Prisma.EventUpdateInput = {};
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return { data, error: "title must be a non-empty string" };
    }
    data.title = body.title.trim();
  }
  if (body.startAt !== undefined && body.startAt !== null) {
    if (typeof body.startAt !== "string") return { data, error: "startAt must be an ISO datetime string" };
    const d = new Date(body.startAt);
    if (Number.isNaN(d.getTime())) return { data, error: "startAt must be a valid ISO datetime" };
    data.startAt = d;
  }
  const end = optionalDate(body.endAt, "endAt");
  if (end.error) return { data, error: end.error };
  if (end.date !== undefined) data.endAt = end.date;
  if (typeof body.type === "string" && body.type) data.type = body.type;
  if (typeof body.location === "string" || body.location === null) data.location = body.location;
  if (body.ownerId === null || typeof body.ownerId === "string") data.ownerId = body.ownerId;
  if (typeof body.note === "string" || body.note === null) data.note = body.note;
  return { data, error: null };
}

/** GET /api/events?from=&to= — inclusive startAt range, ordered startAt asc. */
export async function GET(req: NextRequest) {
  try {
    await ensureSeed();
    const where: { startAt?: { gte?: Date; lte?: Date } } = {};
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "from must be a valid ISO datetime" }, { status: 400 });
      }
      where.startAt = { ...where.startAt, gte: d };
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "to must be a valid ISO datetime" }, { status: 400 });
      }
      where.startAt = { ...where.startAt, lte: d };
    }

    const events = await db.event.findMany({ where, orderBy: { startAt: "asc" } });
    return NextResponse.json(events);
  } catch (e) {
    console.error("GET /api/events failed:", e);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}

/** POST /api/events — create an event and log activity. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (typeof body.startAt !== "string") {
      return NextResponse.json({ error: "startAt is required" }, { status: 400 });
    }
    const startAt = new Date(body.startAt);
    if (Number.isNaN(startAt.getTime())) {
      return NextResponse.json({ error: "startAt must be a valid ISO datetime" }, { status: 400 });
    }

    let endAtValue: Date | null = null;
    if (typeof body.endAt === "string") {
      endAtValue = new Date(body.endAt);
      if (Number.isNaN(endAtValue.getTime())) {
        return NextResponse.json({ error: "endAt must be a valid ISO datetime" }, { status: 400 });
      }
    }

    const created = await db.event.create({
      data: {
        title: body.title.trim(),
        startAt,
        endAt: endAtValue,
        type: typeof body.type === "string" && body.type ? body.type : "personal",
        location: typeof body.location === "string" ? body.location : null,
        ownerId: typeof body.ownerId === "string" ? body.ownerId : null,
        note: typeof body.note === "string" ? body.note : null,
      },
    });

    await db.activityLog.create({
      data: { actor: req.headers.get("X-HS-Actor") ?? "Family", action: "added event", target: created.title },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/events failed:", e);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

/** PATCH /api/events — update partial event fields. */
export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.event.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    const { data, error } = eventFields(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const updated = await db.event.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/events failed:", e);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}

/** DELETE /api/events — remove an event by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.event.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Event not found" }, { status: 404 });

    await db.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/events failed:", e);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
