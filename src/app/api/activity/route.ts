import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";

export const dynamic = "force-dynamic";

/** GET /api/activity — the family's real activity feed. */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;
  const entries = await db.activityLog.findMany({
    where: { familyId: ctx.familyId },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  return NextResponse.json(
    entries.map((a) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      target: a.target,
      createdAt: a.createdAt.toISOString(),
    }))
  );
}
