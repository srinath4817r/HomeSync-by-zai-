import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { logActivity } from "@/lib/homesync/server";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

function serialize(e: {
  id: string; title: string; description: string | null; startAt: Date;
  endAt: Date | null; type: string; location: string | null; createdAt: Date;
}) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt?.toISOString() ?? null,
    type: e.type,
    location: e.location,
    createdAt: e.createdAt.toISOString(),
  };
}

/** GET /api/events?from=&to= — my family's events in a range (defaults: this week). */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const params = req.nextUrl.searchParams;
  const now = new Date();
  const from = params.get("from") ? new Date(String(params.get("from"))) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
  const to = params.get("to") ? new Date(String(params.get("to"))) : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const events = await db.event.findMany({
    where: {
      familyId: ctx.familyId,
      startAt: { gte: Number.isNaN(from.getTime()) ? undefined : from, lte: Number.isNaN(to.getTime()) ? undefined : to },
    },
    orderBy: { startAt: "asc" },
    take: 500,
  });
  return NextResponse.json(events.map(serialize));
}

/** POST /api/events */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const title = String(body.title ?? "").trim().slice(0, 140);
  const startAt = new Date(String(body.startAt ?? ""));
  if (!title || Number.isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Event needs a title and a valid start time." }, { status: 400 });
  }
  const endAt = body.endAt ? new Date(String(body.endAt)) : null;

  const event = await db.event.create({
    data: {
      familyId: ctx.familyId,
      title,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 500) : null,
      startAt,
      endAt: endAt && !Number.isNaN(endAt.getTime()) ? endAt : null,
      type: typeof body.type === "string" && body.type ? body.type.slice(0, 20) : "personal",
      location: typeof body.location === "string" && body.location.trim() ? body.location.trim().slice(0, 120) : null,
      createdById: ctx.user.id,
    },
  });
  await logActivity(ctx.familyId, ctx.user, "added event", title);
  return NextResponse.json({ event: serialize(event) });
}

/** PATCH /api/events */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const event = await db.event.findUnique({ where: { id } });
  if (!event || event.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 140);
  if (typeof body.description === "string") data.description = body.description.trim().slice(0, 500) || null;
  if (typeof body.startAt === "string") {
    const d = new Date(body.startAt);
    if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "Invalid start time." }, { status: 400 });
    data.startAt = d;
  }
  if (body.endAt === null || typeof body.endAt === "string") {
    const d = body.endAt ? new Date(body.endAt) : null;
    data.endAt = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof body.type === "string" && body.type) data.type = body.type.slice(0, 20);
  if (typeof body.location === "string") data.location = body.location.trim().slice(0, 120) || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }
  const updated = await db.event.update({ where: { id }, data });
  return NextResponse.json({ event: serialize(updated) });
}

/** DELETE /api/events */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const body = await readJson(req);
  const id = String(body.id ?? "");
  const event = await db.event.findUnique({ where: { id } });
  if (!event || event.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }
  await db.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
