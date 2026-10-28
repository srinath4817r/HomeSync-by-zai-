import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isGuardFailure, requireUser } from "@/lib/homesync/auth";
import { readJson } from "../_lib/http";

export const dynamic = "force-dynamic";

/** GET /api/notifications — my notifications (newest first). */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (isGuardFailure(auth)) return auth;
  const items = await db.notification.findMany({
    where: { userId: auth.id },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return NextResponse.json({
    notifications: items.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

/** PATCH /api/notifications — mark one (or all) as read. */
export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (isGuardFailure(auth)) return auth;
  const body = await readJson(req);
  if (body.all === true) {
    await db.notification.updateMany({
      where: { userId: auth.id, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  const id = String(body.id ?? "");
  await db.notification.updateMany({
    where: { id, userId: auth.id, readAt: null },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
