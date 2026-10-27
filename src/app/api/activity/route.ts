import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSeed } from "@/lib/homesync/seed";

export const dynamic = "force-dynamic";

/** GET /api/activity — latest 30 activity entries, newest first. */
export async function GET() {
  try {
    await ensureSeed();
    const activity = await db.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json(activity);
  } catch (e) {
    console.error("GET /api/activity failed:", e);
    return NextResponse.json({ error: "Failed to load activity" }, { status: 500 });
  }
}
