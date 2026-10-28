import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/homesync/auth";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — invalidate the current session server-side. */
export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session
      .delete({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } })
      .catch(() => undefined);
  }
  return clearSessionCookie(NextResponse.json({ ok: true }));
}
