import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/homesync/seed";
import { db } from "@/lib/db";
import type { AppUser } from "@prisma/client";

export const dynamic = "force-dynamic";

export function serializeUser(user: AppUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    relation: user.relation,
    color: user.color,
    photoUrl: user.photoUrl ?? null,
    memberId: user.memberId,
    isGuest: false,
    provider: user.provider,
    profileLocked: user.profileLocked,
  };
}

export function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  return req
    .json()
    .catch(() => ({}))
    .then((b) => (b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {}));
}

/** POST /api/auth/login — email + password sign-in against the family account directory. */
export async function POST(req: NextRequest) {
  try {
    await ensureSeed();
    const body = await readJson(req);
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");

    if (!email || !password) {
      return NextResponse.json(
        { error: "Enter your email and password to continue." },
        { status: 400 }
      );
    }

    const user = await db.appUser.findUnique({ where: { email } });
    if (!user || user.password !== password) {
      return NextResponse.json(
        { error: "That email or password doesn't match our home." },
        { status: 401 }
      );
    }

    return NextResponse.json({ user: serializeUser(user) });
  } catch (e) {
    console.error("POST /api/auth/login failed:", e);
    return NextResponse.json(
      { error: "Sign-in failed. Please try again." },
      { status: 500 }
    );
  }
}
