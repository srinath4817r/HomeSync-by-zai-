import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireFamily } from "@/lib/homesync/auth";
import { familyMembers } from "@/lib/homesync/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — every number comes from a real database query.
 * An empty family produces real zeros and honest empty lists.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireFamily(req);
  if (isGuardFailure(ctx)) return ctx;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const [todayEvents, tasksPending, groceryToBuy, medicinesToday, billsDue, members, activity] =
    await Promise.all([
      db.event.findMany({
        where: { familyId: ctx.familyId, startAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { startAt: "asc" },
        take: 20,
      }),
      db.task.count({ where: { familyId: ctx.familyId, status: { not: "done" } } }),
      db.groceryItem.count({ where: { familyId: ctx.familyId, status: "needed" } }),
      db.medicine.count({ where: { familyId: ctx.familyId, scheduledAt: { gte: dayStart, lt: dayEnd } } }),
      db.bill.count({ where: { familyId: ctx.familyId, status: "due", dueDate: { lte: new Date(dayEnd.getTime() + 7 * 24 * 3600 * 1000) } } }),
      familyMembers(ctx.familyId),
      db.activityLog.findMany({
        where: { familyId: ctx.familyId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);

  const upcoming = todayEvents.find((e) => e.startAt.getTime() >= now.getTime());
  const fmt = upcoming
    ? upcoming.startAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    : null;
  const nextEventLabel = upcoming
    ? `Next at ${fmt}`
    : todayEvents.length > 0
      ? "No more events today"
      : "No events today";

  return NextResponse.json({
    stats: {
      todayEvents: todayEvents.length,
      nextEventLabel,
      tasksPending,
      groceryToBuy,
      medicinesToday,
      billsDue,
      checkIns: members.filter((m) => m.locationSharing).length,
      membersTotal: members.length,
    },
    todayEvents: todayEvents.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt?.toISOString() ?? null,
      type: e.type,
      location: e.location,
      createdAt: e.createdAt.toISOString(),
    })),
    activity: activity.map((a) => ({
      id: a.id,
      actor: a.actor,
      action: a.action,
      target: a.target,
      createdAt: a.createdAt.toISOString(),
    })),
    members,
  });
}
