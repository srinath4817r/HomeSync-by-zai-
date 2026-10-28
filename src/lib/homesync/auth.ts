import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Server-verified sessions.
 * The browser holds an httpOnly cookie with a random token; the database
 * stores only its SHA-256 hash. No client-side state can grant access.
 */

export const SESSION_COOKIE = "hs_session";
const SESSION_TTL_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Create a session row and return the raw token (to set as cookie). */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);
  await db.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

/** Attach the session cookie to a response. */
export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date): NextResponse {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  photoUrl: string | null;
}

/** Read the current user from the session cookie (null when signed out). */
export async function getSessionUser(req: NextRequest): Promise<AuthedUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    photoUrl: session.user.photoUrl,
  };
}

export interface FamilyContext {
  user: AuthedUser;
  familyId: string;
  familyName: string;
  role: string; // membership role, e.g. "Family Admin"
  status: string; // "active" | "pending"
  isAdmin: boolean;
}

/**
 * Resolve the caller's active family. Returns null fields when the user has
 * no family yet; status "pending" must be handled by the caller.
 */
export async function getFamilyContext(req: NextRequest): Promise<FamilyContext | null> {
  const user = await getSessionUser(req);
  if (!user) return null;
  const membership = await db.membership.findFirst({
    where: { userId: user.id, status: "active" },
    include: { family: false },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return null;
  return {
    user,
    familyId: membership.familyId,
    familyName: "",
    role: membership.role,
    status: membership.status,
    isAdmin: membership.role === "Family Admin",
  };
}

/** Standard 401 JSON response. */
export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
}

/** Guard: authenticated user. */
export async function requireUser(
  req: NextRequest
): Promise<AuthedUser | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  return user;
}

/** Guard: authenticated user with an ACTIVE family membership (admin optional). */
export async function requireFamily(
  req: NextRequest,
  opts?: { adminOnly?: boolean }
): Promise<FamilyContext | NextResponse> {
  const user = await getSessionUser(req);
  if (!user) return unauthorized();
  const membership = await db.membership.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return NextResponse.json({ error: "Create or join a family first." }, { status: 403 });
  }
  if (opts?.adminOnly && membership.role !== "Family Admin") {
    return NextResponse.json(
      { error: "Only the Family Admin can do that." },
      { status: 403 }
    );
  }
  return {
    user,
    familyId: membership.familyId,
    familyName: "",
    role: membership.role,
    status: membership.status,
    isAdmin: membership.role === "Family Admin",
  };
}

/** True when the response value is a NextResponse (guard failure). */
export function isGuardFailure<T>(v: T | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}
