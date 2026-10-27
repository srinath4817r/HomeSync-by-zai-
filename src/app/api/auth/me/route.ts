import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/homesync/seed";
import { db } from "@/lib/db";
import { readJson, serializeUser } from "../login/route";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["Family Admin", "Parent", "Senior Member", "Child"];

/**
 * PATCH /api/auth/me — a signed-in user edits their OWN display name / role.
 * Open until the Family Admin edits the profile — after that it is locked
 * (AppUser.profileLocked) and only the admin can change it again.
 * Changes sync to the linked family Member so the map and lists stay in sync.
 */
export async function PATCH(req: NextRequest) {
  try {
    await ensureSeed();
    const body = await readJson(req);
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });

    const user = await db.appUser.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    if (user.profileLocked) {
      return NextResponse.json(
        { error: "Your profile was updated by the Family Admin and is locked. Ask them to change it." },
        { status: 403 }
      );
    }

    const data: { name?: string; role?: string } = {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name) data.name = name.slice(0, 60);
    if (typeof body.role === "string" && ALLOWED_ROLES.includes(body.role)) {
      data.role = body.role;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const updated = await db.appUser.update({ where: { id: user.id }, data });

    // Keep the linked family member in sync.
    if (updated.memberId) {
      const memberData: { name?: string; role?: string } = {};
      if (data.name) memberData.name = data.name;
      if (data.role) memberData.role = data.role;
      if (Object.keys(memberData).length > 0) {
        await db.member.update({ where: { id: updated.memberId }, data: memberData });
      }
    }

    if (data.name) {
      await db.activityLog.create({
        data: { actor: updated.name, action: "updated their profile", target: data.name },
      });
    }

    return NextResponse.json({ user: serializeUser(updated) });
  } catch (e) {
    console.error("PATCH /api/auth/me failed:", e);
    return NextResponse.json({ error: "Could not update your profile." }, { status: 500 });
  }
}
