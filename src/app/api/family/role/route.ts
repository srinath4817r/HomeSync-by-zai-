import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { readJson } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/family/role — change a member's role (admin only, server-enforced).
 * Body: { membershipId, role }
 * Guards: fixed role list, the LAST Family Admin can never be demoted/removed.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const membershipId = String(body.membershipId ?? "");
  const role = String(body.role ?? "");

  const ALLOWED = new Set(["Family Admin", "Parent", "Senior Member", "Child", "Caregiver", "Member"]);
  if (!ALLOWED.has(role)) {
    return NextResponse.json({ error: "Unknown role." }, { status: 400 });
  }

  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership || membership.familyId !== ctx.familyId || membership.status !== "active") {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  if (membership.role === "Family Admin" && role !== "Family Admin") {
    const adminCount = await db.membership.count({
      where: { familyId: ctx.familyId, status: "active", role: "Family Admin" },
    });
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: "There must always be one Family Admin. Promote someone else first." },
        { status: 403 }
      );
    }
  }

  await db.membership.update({ where: { id: membershipId }, data: { role } });

  // Keep the linked household profile in sync.
  const memberProfile = await db.member.findFirst({
    where: { familyId: ctx.familyId, userId: membership.userId },
  });
  if (memberProfile) {
    await db.member.update({
      where: { id: memberProfile.id },
      data: { role, isAdmin: role === "Family Admin" },
    });
  }

  const targetUser = await db.appUser.findUnique({ where: { id: membership.userId } });
  if (targetUser) {
    await db.notification.create({
      data: {
        userId: targetUser.id,
        familyId: ctx.familyId,
        title: "Role updated",
        body: `Your family role is now ${role}.`,
      },
    });
  }
  await db.activityLog.create({
    data: {
      familyId: ctx.familyId,
      actorId: ctx.user.id,
      actor: ctx.user.name,
      action: "changed role",
      target: `${targetUser?.name ?? "member"} → ${role}`,
    },
  });

  return NextResponse.json({ ok: true, role });
}
