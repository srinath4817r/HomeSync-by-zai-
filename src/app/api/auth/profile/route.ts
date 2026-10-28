import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireUser } from "@/lib/homesync/auth";
import { readJson } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/auth/profile — signed-in user updates their OWN display name.
 * Role is never editable here — only an admin can change roles (server rule).
 * The linked household profile name is kept in sync.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (isGuardFailure(auth)) return auth;

  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ error: "Enter a name." }, { status: 400 });

  const user = await db.appUser.update({ where: { id: auth.id }, data: { name } });

  // Sync every household profile linked to this user across their families.
  const memberships = await db.membership.findMany({ where: { userId: auth.id } });
  for (const m of memberships) {
    await db.member.updateMany({ where: { familyId: m.familyId, userId: auth.id }, data: { name } });
  }

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl },
  });
}
