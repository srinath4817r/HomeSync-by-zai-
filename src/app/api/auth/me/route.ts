import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/homesync/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me — hydrate the client from the server session.
 * Returns the signed-in user plus their family context (or nulls).
 * This is the single source of truth — client state is only a cache.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ user: null, membership: null, family: null });
    }

    const membership = await db.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    let family = null;
    if (membership && membership.status === "active") {
      const fam = await db.family.findUnique({ where: { id: membership.familyId } });
      if (fam) {
        family = {
          id: fam.id,
          name: fam.name,
          homeLabel: fam.homeLabel,
          homeLat: fam.homeLat,
          homeLng: fam.homeLng,
          capacity: fam.capacity,
          timezone: fam.timezone,
        };
      }
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl },
      membership: membership
        ? { role: membership.role, status: membership.status, familyId: membership.familyId }
        : null,
      family,
    });
  } catch (e) {
    console.error("GET /api/auth/me failed:", e);
    return NextResponse.json({ user: null, membership: null, family: null });
  }
}
