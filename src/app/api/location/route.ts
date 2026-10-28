import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

const MAX_PING_AGE_MS = 45 * 60 * 1000; // older than this = stale

/**
 * GET /api/location — latest REAL pings for consenting household members.
 * Returns each member's last recorded position with freshness info.
 * Members without consent or without any ping are reported as such.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const members = await db.member.findMany({ where: { familyId: ctx.familyId } });
  const consenting = members.filter((m) => m.locationSharing);
  const pings = await db.locationPing.findMany({
    where: { memberId: { in: consenting.map((m) => m.id) } },
    orderBy: { capturedAt: "desc" },
    take: 300,
  });

  const latest = new Map<string, (typeof pings)[number]>();
  for (const p of pings) {
    if (!latest.has(p.memberId)) latest.set(p.memberId, p);
  }

  return NextResponse.json({
    locations: members.map((m) => {
      const ping = latest.get(m.id) ?? null;
      const age = ping ? Date.now() - ping.capturedAt.getTime() : null;
      return {
        memberId: m.id,
        name: m.name,
        photoUrl: m.photoUrl,
        color: m.color,
        sharing: m.locationSharing,
        placeLabel: m.placeLabel,
        // A position is ONLY present when a real authorized device recorded one.
        position:
          ping && age !== null && age < MAX_PING_AGE_MS
            ? { lat: ping.lat, lng: ping.lng, accuracyM: ping.accuracyM }
            : null,
        lastPingAt: ping?.capturedAt.toISOString() ?? null,
        stale: ping ? (age ?? Infinity) >= MAX_PING_AGE_MS : true,
      };
    }),
  });
}

/**
 * POST /api/location — ingest a REAL GPS sample from the signed-in user's device.
 * Body: { lat, lng, accuracyM?, capturedAt? }
 * Stored only if the user's household profile has location sharing ON.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const profile = await db.member.findFirst({
    where: { familyId: ctx.familyId, userId: ctx.user.id },
  });
  if (!profile) {
    return NextResponse.json({ error: "No household profile is linked to your account." }, { status: 403 });
  }
  if (!profile.locationSharing) {
    return NextResponse.json({ error: "Location sharing is off. Turn it on first." }, { status: 403 });
  }

  const body = await readJson(req);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }
  const accuracyM = Number.isFinite(Number(body.accuracyM)) ? Math.max(Number(body.accuracyM), 0) : null;
  const capturedAt = body.capturedAt ? new Date(String(body.capturedAt)) : new Date();
  const safeCapturedAt = Number.isNaN(capturedAt.getTime()) ? new Date() : capturedAt;

  const ping = await db.locationPing.create({
    data: {
      familyId: ctx.familyId,
      memberId: profile.id,
      lat,
      lng,
      accuracyM,
      capturedAt: safeCapturedAt,
    },
  });
  await db.member.update({ where: { id: profile.id }, data: { placeLabel: profile.placeLabel } });
  return NextResponse.json({ ok: true, id: ping.id, capturedAt: ping.capturedAt.toISOString() });
}

/** DELETE /api/location — delete MY location history (user-accessible history deletion). */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  // LocationPing has no `member` relation — resolve my profile in this family first.
  const profile = await db.member.findFirst({
    where: { familyId: ctx.familyId, userId: ctx.user.id },
  });
  await db.locationPing.deleteMany({
    where: { familyId: ctx.familyId, memberId: profile?.id ?? "__none__" },
  });
  return NextResponse.json({ ok: true });
}
