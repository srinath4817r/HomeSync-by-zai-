import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { readJson } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/family/requests — pending join requests (admin only).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const pending = await db.membership.findMany({
    where: { familyId: ctx.familyId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  const users = await db.appUser.findMany({
    where: { id: { in: pending.map((p) => p.userId) } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    requests: pending.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      user: {
        id: p.userId,
        name: byId.get(p.userId)?.name ?? "Someone",
        email: byId.get(p.userId)?.email ?? "",
        photoUrl: byId.get(p.userId)?.photoUrl ?? null,
      },
    })),
  });
}

/**
 * POST /api/family/requests — approve or reject a join request (admin only).
 * Body: { membershipId, action: "approve" | "reject", role? }
 * The role is chosen server-side from a fixed list — never trusted from the requester.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const membershipId = String(body.membershipId ?? "");
  const action = String(body.action ?? "");
  if (!membershipId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const membership = await db.membership.findUnique({ where: { id: membershipId } });
  if (!membership || membership.familyId !== ctx.familyId || membership.status !== "pending") {
    return NextResponse.json({ error: "That request no longer exists." }, { status: 404 });
  }

  const user = await db.appUser.findUnique({ where: { id: membership.userId } });
  if (!user) return NextResponse.json({ error: "That user no longer exists." }, { status: 404 });

  if (action === "reject") {
    await db.membership.delete({ where: { id: membership.id } });
    await db.notification.create({
      data: {
        userId: user.id,
        familyId: ctx.familyId,
        title: "Join request declined",
        body: `Your request to join was declined by the Family Admin.`,
      },
    });
    return NextResponse.json({ ok: true, action: "reject" });
  }

  // Approve — role from the fixed allow-list only.
  const ALLOWED = new Set(["Parent", "Senior Member", "Child", "Caregiver", "Member"]);
  const role = typeof body.role === "string" && ALLOWED.has(body.role) ? body.role : "Member";

  const activeCount = await db.membership.count({ where: { familyId: ctx.familyId, status: "active" } });
  const family = await db.family.findUnique({ where: { id: ctx.familyId } });
  if (family && activeCount >= family.capacity) {
    return NextResponse.json({ error: "Family capacity reached. Increase capacity in settings first." }, { status: 403 });
  }

  await db.membership.update({ where: { id: membership.id }, data: { status: "active", role, requestedRole: null } });
  await db.member.create({
    data: {
      familyId: ctx.familyId,
      userId: user.id,
      name: user.name,
      relation: "Member",
      role,
      color: "#8f7a99",
      photoUrl: user.photoUrl,
      isAdmin: false,
    },
  });
  await db.notification.create({
    data: {
      userId: user.id,
      familyId: ctx.familyId,
      title: "Welcome home",
      body: `Your request was approved. You joined as ${role}.`,
      link: "overview",
    },
  });
  await db.activityLog.create({
    data: { familyId: ctx.familyId, actorId: ctx.user.id, actor: ctx.user.name, action: "approved join request", target: user.name },
  });

  return NextResponse.json({ ok: true, action: "approve", role });
}
