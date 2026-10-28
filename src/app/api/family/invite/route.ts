import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { generateInviteCode, readJson } from "../../_lib/http";

export const dynamic = "force-dynamic";

/** GET /api/family/invite — list invitations (admin only). */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const invitations = await db.invitation.findMany({
    where: { familyId: ctx.familyId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({
    invitations: invitations.map((i) => ({
      id: i.id,
      code: i.code,
      expiresAt: i.expiresAt,
      revokedAt: i.revokedAt,
      createdAt: i.createdAt,
      expired: i.expiresAt.getTime() < Date.now(),
    })),
  });
}

/** POST /api/family/invite — create a new invite code (admin only). */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const daysRaw = Number(body.expiresInDays);
  const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.trunc(daysRaw), 1), 30) : 7;

  let code = generateInviteCode();
  // Codes are unique — retry on the astronomically unlikely collision.
  for (let i = 0; i < 3; i++) {
    const clash = await db.invitation.findUnique({ where: { code } });
    if (!clash) break;
    code = generateInviteCode();
  }

  const invitation = await db.invitation.create({
    data: {
      familyId: ctx.familyId,
      code,
      createdById: ctx.user.id,
      expiresAt: new Date(Date.now() + days * 24 * 3600 * 1000),
    },
  });
  await db.activityLog.create({
    data: { familyId: ctx.familyId, actorId: ctx.user.id, actor: ctx.user.name, action: "created an invite code", target: code },
  });

  return NextResponse.json({
    invitation: {
      id: invitation.id,
      code: invitation.code,
      expiresAt: invitation.expiresAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
      expired: false,
    },
  });
}

/** DELETE /api/family/invite — revoke a code (admin only). */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const invitation = await db.invitation.findUnique({ where: { id } });
  if (!invitation || invitation.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  }
  await db.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
