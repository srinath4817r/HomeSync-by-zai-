import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireUser } from "@/lib/homesync/auth";
import { readJson } from "../../_lib/http";
import { rateLimit } from "@/lib/homesync/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/family/join — join a household with a valid invite code.
 * The membership starts PENDING until a Family Admin approves it.
 * Capacity, expiry and revocation are all enforced here on the server.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (isGuardFailure(auth)) return auth;
  const limited = rateLimit(`join:${auth.id}`, 10, 15 * 60_000);
  if (limited) return limited;

  const body = await readJson(req);
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "Enter the invite code your family shared." }, { status: 400 });

  const invitation = await db.invitation.findUnique({ where: { code } });
  if (!invitation || invitation.revokedAt) {
    return NextResponse.json({ error: "That invite code is not valid." }, { status: 404 });
  }
  if (invitation.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "That invite code has expired. Ask your admin for a new one." }, { status: 410 });
  }

  const existing = await db.membership.findUnique({
    where: { userId_familyId: { userId: auth.id, familyId: invitation.familyId } },
  });
  if (existing) {
    return NextResponse.json({
      status: existing.status,
      message:
        existing.status === "active"
          ? "You are already part of this family."
          : "Your request is already waiting for admin approval.",
    });
  }

  const activeCount = await db.membership.count({
    where: { familyId: invitation.familyId, status: "active" },
  });
  const family = await db.family.findUnique({ where: { id: invitation.familyId } });
  if (!family) return NextResponse.json({ error: "That family no longer exists." }, { status: 404 });
  if (activeCount >= family.capacity) {
    return NextResponse.json({ error: "This family is full. Ask the admin about their plan." }, { status: 403 });
  }

  const membership = await db.membership.create({
    data: {
      userId: auth.id,
      familyId: invitation.familyId,
      role: "Member",
      status: "pending",
      requestedRole: "Member",
    },
  });

  // Notify every active admin that someone asked to join.
  const admins = await db.membership.findMany({
    where: { familyId: invitation.familyId, status: "active", role: "Family Admin" },
  });
  await db.notification.createMany({
    data: admins.map((a) => ({
      userId: a.userId,
      familyId: invitation.familyId,
      title: "Join request",
      body: `${auth.name} (${auth.email}) asked to join ${family.name}.`,
      link: "members",
    })),
  });
  void membership;

  return NextResponse.json({
    status: "pending",
    message: "Request sent. A Family Admin will approve you shortly.",
  });
}
