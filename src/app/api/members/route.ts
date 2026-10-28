import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { familyMembers, logActivity, pickColor, serializeMember } from "@/lib/homesync/server";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["Family Admin", "Parent", "Senior Member", "Child", "Caregiver", "Member"]);

/** GET /api/members — household profiles of my family (with real last pings). */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  return NextResponse.json(await familyMembers(ctx.familyId));
}

/**
 * POST /api/members — add a household profile (e.g. a grandparent who does
 * not use the app). Real user-entered data, scoped to the caller's family.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const name = String(body.name ?? "").trim().slice(0, 60);
  const relation = String(body.relation ?? "").trim().slice(0, 30) || "Member";
  const role = ALLOWED_ROLES.has(String(body.role)) ? String(body.role) : "Member";
  if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });

  const count = await db.member.count({ where: { familyId: ctx.familyId } });
  const family = await db.family.findUnique({ where: { id: ctx.familyId } });
  if (family && count >= family.capacity + 12) {
    return NextResponse.json({ error: "Too many profiles for this household." }, { status: 403 });
  }

  // Only an admin can create an ADMIN profile.
  const isAdmin = body.isAdmin === true && ctx.isAdmin;
  const member = await db.member.create({
    data: {
      familyId: ctx.familyId,
      name,
      relation,
      role: isAdmin ? "Family Admin" : role,
      color: pickColor(`${name}${relation}`),
      isAdmin,
      locationSharing: false,
    },
  });
  await logActivity(ctx.familyId, ctx.user, "added family member", name);
  return NextResponse.json({ member: serializeMember(member) });
}

/**
 * PATCH /api/members — edit a household profile.
 * Role / isAdmin changes are ADMIN-ONLY and enforced here.
 */
export async function PATCH(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const member = await db.member.findUnique({ where: { id } });
  if (!member || member.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 60);
  if (typeof body.relation === "string" && body.relation.trim()) data.relation = body.relation.trim().slice(0, 30);
  if (typeof body.role === "string" && ALLOWED_ROLES.has(body.role)) {
    if (!ctx.isAdmin && body.role !== member.role) {
      return NextResponse.json({ error: "Only the Family Admin can change roles." }, { status: 403 });
    }
    data.role = body.role;
    if (body.role === "Family Admin") data.isAdmin = true;
  }
  if (typeof body.isAdmin === "boolean") {
    if (!ctx.isAdmin) {
      return NextResponse.json({ error: "Only the Family Admin can change admin status." }, { status: 403 });
    }
    data.isAdmin = body.isAdmin;
    if (body.isAdmin) data.role = "Family Admin";
  }
  if (typeof body.locationSharing === "boolean") {
    // Members may toggle their OWN sharing consent; admins may toggle anyone.
    const isSelf = member.userId === ctx.user.id;
    if (!isSelf && !ctx.isAdmin) {
      return NextResponse.json({ error: "You can only change your own location sharing." }, { status: 403 });
    }
    data.locationSharing = body.locationSharing;
  }
  if (typeof body.placeLabel === "string") {
    const isSelf = member.userId === ctx.user.id;
    if (!isSelf && !ctx.isAdmin) {
      return NextResponse.json({ error: "You can only change your own place label." }, { status: 403 });
    }
    data.placeLabel = body.placeLabel.trim().slice(0, 60) || null;
  }
  if (typeof body.photoUrl === "string" || body.photoUrl === null) {
    const isSelf = member.userId === ctx.user.id;
    if (!isSelf && !ctx.isAdmin) {
      return NextResponse.json({ error: "You can only change your own photo." }, { status: 403 });
    }
    data.photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.slice(0, 500) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await db.member.update({ where: { id }, data });

  // Keep the linked user's membership role in sync when an admin changed it.
  if ((data.role || data.isAdmin !== undefined) && updated.userId) {
    const membership = await db.membership.findFirst({
      where: { userId: updated.userId, familyId: ctx.familyId },
    });
    if (membership) {
      await db.membership.update({
        where: { id: membership.id },
        data: { role: (data.role as string) ?? membership.role },
      });
    }
  }

  return NextResponse.json({ member: serializeMember(updated) });
}

/** DELETE /api/members — remove a household profile (admin only). */
export async function DELETE(req: NextRequest) {
  const ctx = await requireFamily(req, { adminOnly: true });
  if (isGuardFailure(ctx)) return ctx;

  const body = await readJson(req);
  const id = String(body.id ?? "");
  const member = await db.member.findUnique({ where: { id } });
  if (!member || member.familyId !== ctx.familyId) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }
  if (member.isAdmin) {
    const adminProfiles = await db.member.count({ where: { familyId: ctx.familyId, isAdmin: true } });
    if (adminProfiles <= 1) {
      return NextResponse.json({ error: "There must always be one Family Admin." }, { status: 403 });
    }
  }
  await db.medicine.deleteMany({ where: { memberId: id } });
  await db.locationPing.deleteMany({ where: { memberId: id } });
  await db.member.delete({ where: { id } });
  await logActivity(ctx.familyId, ctx.user, "removed family member", member.name);
  return NextResponse.json({ ok: true });
}
