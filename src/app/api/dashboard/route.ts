import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

/** GET /api/dashboard — stats + today's events + recent activity + members. */
export async function GET() {
  try {
    await ensureSeed();

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const now = new Date();

    const [eventsToday, tasksPending, groceryToBuy, medicinesToday, billsDue, members, activity] =
      await Promise.all([
        db.event.findMany({ where: { startAt: { gte: start, lt: end } }, orderBy: { startAt: "asc" } }),
        db.task.count({ where: { status: { not: "done" } } }),
        db.groceryItem.count({ where: { status: "needed" } }),
        db.medicine.count({ where: { scheduledAt: { gte: start, lt: end } } }),
        db.bill.count({ where: { status: "due" } }),
        db.member.findMany({ orderBy: { createdAt: "asc" } }),
        db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      ]);

    const upcoming = eventsToday.find((e) => {
      const effectiveEnd = e.endAt ?? e.startAt;
      return effectiveEnd.getTime() > now.getTime();
    });

    const nextEventLabel = upcoming
      ? `Next at ${upcoming.startAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`
      : "No more events today";

    const stats = {
      todayEvents: eventsToday.length,
      nextEventLabel,
      tasksPending,
      groceryToBuy,
      medicinesToday,
      billsDue,
      checkIns: members.filter((m) => m.locationSharing).length,
      membersTotal: members.length,
    };

    return NextResponse.json({ stats, todayEvents: eventsToday, activity, members });
  } catch (e) {
    console.error("GET /api/dashboard failed:", e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
