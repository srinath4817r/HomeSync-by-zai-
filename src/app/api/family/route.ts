import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily, requireUser } from "@/lib/homesync/auth";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

/** GET /api/family — the caller's family, membership and household profiles. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (isGuardFailure(auth)) return auth;

  const membership = await db.membership.findFirst({
    where: { userId: auth.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ membership: null, family: null, members: [] });

  const family = await db.family.findUnique({ where: { id: membership.familyId } });
  const members = await db.member.findMany({
    where: { familyId: membership.familyId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    membership: { role: membership.role, status: membership.status },
    family: family
      ? {
          id: family.id,
          name: family.name,
          homeLabel: family.homeLabel,
          homeLat: family.homeLat,
          homeLng: family.homeLng,
          capacity: family.capacity,
          timezone: family.timezone,
        }
      : null,
    members,
  });
}

/** POST /api/family — create a real family. The CREATOR becomes Family Admin (server-decided). */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (isGuardFailure(auth)) return auth;

  const existing = await db.membership.findFirst({
    where: { userId: auth.id, status: "active" },
  });
  if (existing) {
    return NextResponse.json({ error: "You already belong to a family." }, { status: 409 });
  }

  const body = await readJson(req);
  const name = String(body.name ?? "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Give your family a name." }, { status: 400 });

  const capacityRaw = Number(body.capacity);
  const capacity = Number.isFinite(capacityRaw) ? Math.min(Math.max(Math.trunc(capacityRaw), 1), 24) : 8;
  const homeLabel = typeof body.homeLabel === "string" && body.homeLabel.trim() ? body.homeLabel.trim().slice(0, 80) : null;
  const homeLat = Number.isFinite(Number(body.homeLat)) ? Number(body.homeLat) : null;
  const homeLng = Number.isFinite(Number(body.homeLng)) ? Number(body.homeLng) : null;

  const family = await db.family.create({
    data: { name, capacity, homeLabel, homeLat, homeLng, createdById: auth.id },
  });
  await db.membership.create({
    data: { userId: auth.id, familyId: family.id, role: "Family Admin", status: "active" },
  });
  await db.member.create({
    data: {
      familyId: family.id,
      userId: auth.id,
      name: auth.name,
      relation: "Me",
      role: "Family Admin",
      color: "#64748b",
      photoUrl: auth.photoUrl,
      isAdmin: true,
    },
  });
  await db.activityLog.create({
    data: { familyId: family.id, actorId: auth.id, actor: auth.name, action: "created the family", target: name },
  });

  return NextResponse.json({
    family: {
      id: family.id,
      name: family.name,
      homeLabel: family.homeLabel,
      homeLat: family.homeLat,
      homeLng: family.homeLng,
      capacity: family.capacity,
      timezone: family.timezone,
    },
    membership: { role: "Family Admin", status: "active" },
  });
}

/** PATCH /api/family — update household settings (admin only). */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if (typeof body.homeLabel === "string") data.homeLabel = body.homeLabel.trim().slice(0, 80) || null;
  if (body.homeLat === null || Number.isFinite(Number(body.homeLat))) data.homeLat = body.homeLat === null ? null : Number(body.homeLat);
  if (body.homeLng === null || Number.isFinite(Number(body.homeLng))) data.homeLng = body.homeLng === null ? null : Number(body.homeLng);
  if (Number.isFinite(Number(body.capacity))) {
    const activeCount = await db.membership.count({ where: { familyId: ctx.familyId, status: "active" } });
    const cap = Math.min(Math.max(Math.trunc(Number(body.capacity)), activeCount), 24);
    data.capacity = cap;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const family = await db.family.update({ where: { id: ctx.familyId }, data });
  await db.activityLog.create({
    data: { familyId: ctx.familyId, actorId: ctx.user.id, actor: ctx.user.name, action: "updated family settings", target: family.name },
  });
  return NextResponse.json({ ok: true });
}
