import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

const ADMIN_ERROR = "Family must keep at least one administrator";

async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

/** GET /api/members — all members, oldest first. */
export async function GET() {
  try {
    await ensureSeed();
    const members = await db.member.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json(members);
  } catch (e) {
    console.error("GET /api/members failed:", e);
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}

/** POST /api/members — invite a new family member. */
export async function POST(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const name = typeof body.name === "string" ? body.name.trim() : "";
    const relation = typeof body.relation === "string" ? body.relation.trim() : "";
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    if (!relation) return NextResponse.json({ error: "relation is required" }, { status: 400 });

    const created = await db.member.create({
      data: {
        name,
        relation,
        role: typeof body.role === "string" && body.role.trim() ? body.role.trim() : "Member",
        color: typeof body.color === "string" && body.color ? body.color : "#64748b",
        isAdmin: body.isAdmin === true,
        locationSharing: false,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error("POST /api/members failed:", e);
    return NextResponse.json({ error: "Failed to create member" }, { status: 500 });
  }
}

/** PATCH /api/members — update partial member fields (id required). */
export async function PATCH(req: NextRequest) {
  try {
    const body = await readBody(req);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.member.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (typeof body.relation === "string" && body.relation.trim()) data.relation = body.relation.trim();
    if (typeof body.role === "string" && body.role.trim()) data.role = body.role.trim();
    if (typeof body.color === "string" && body.color) data.color = body.color;
    if (typeof body.isAdmin === "boolean") data.isAdmin = body.isAdmin;
    if (typeof body.locationSharing === "boolean") data.locationSharing = body.locationSharing;
    if (body.locationLabel === null || typeof body.locationLabel === "string") {
      data.locationLabel = body.locationLabel;
    }
    if (body.locationUpdatedAt === null) {
      data.locationUpdatedAt = null;
    } else if (typeof body.locationUpdatedAt === "string") {
      const d = new Date(body.locationUpdatedAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { error: "locationUpdatedAt must be a valid ISO datetime" },
          { status: 400 }
        );
      }
      data.locationUpdatedAt = d;
    }

    // Safety: never allow the last administrator to be demoted.
    if (existing.isAdmin && data.isAdmin === false) {
      const otherAdmins = await db.member.count({ where: { isAdmin: true, id: { not: id } } });
      if (otherAdmins === 0) return NextResponse.json({ error: ADMIN_ERROR }, { status: 400 });
    }

    const updated = await db.member.update({ where: { id }, data });

    // When the admin edits a member's identity, lock that user's self-edit
    // profile and mirror the changes onto their linked account.
    const identityChanged =
      (typeof data.name === "string" && data.name !== existing.name) ||
      (typeof data.role === "string" && data.role !== existing.role);
    if (identityChanged || body.lockProfile === true) {
      const linkedUsers = await db.appUser.findMany({ where: { memberId: id } });
      for (const u of linkedUsers) {
        await db.appUser.update({
          where: { id: u.id },
          data: {
            profileLocked: true,
            ...(typeof data.name === "string" ? { name: data.name } : {}),
            ...(typeof data.role === "string" ? { role: data.role } : {}),
          },
        });
      }
    }

    const actor = req.headers.get("X-HS-Actor") ?? "Family Admin";
    const logs: { actor: string; action: string; target: string }[] = [];
    if (typeof data.role === "string" && data.role !== existing.role) {
      logs.push({ actor, action: "updated role of", target: updated.name });
    }
    if (identityChanged) {
      logs.push({ actor, action: "updated profile of", target: updated.name });
    }
    if (typeof data.locationSharing === "boolean" && data.locationSharing !== existing.locationSharing) {
      logs.push({
        actor,
        action: data.locationSharing ? "resumed location sharing for" : "paused location sharing for",
        target: updated.name,
      });
    }
    if (logs.length > 0) await db.activityLog.createMany({ data: logs });

    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/members failed:", e);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

/** DELETE /api/members — remove a member by id (JSON body, searchParams fallback). */
export async function DELETE(req: NextRequest) {
  try {
    const body = await readBody(req);
    const id =
      (body && typeof body.id === "string" ? body.id : "") ||
      req.nextUrl.searchParams.get("id") ||
      "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const existing = await db.member.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    if (existing.isAdmin) {
      const otherAdmins = await db.member.count({ where: { isAdmin: true, id: { not: id } } });
      if (otherAdmins === 0) return NextResponse.json({ error: ADMIN_ERROR }, { status: 400 });
    }

    await db.member.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/members failed:", e);
    return NextResponse.json({ error: "Failed to delete member" }, { status: 500 });
  }
}
