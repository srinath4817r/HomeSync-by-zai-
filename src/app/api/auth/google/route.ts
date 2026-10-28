import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/homesync/auth";

export const dynamic = "force-dynamic";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/**
 * GET /api/auth/google — reports whether REAL Google OAuth is configured.
 * The login screen uses this to start the real flow or show setup guidance.
 */
export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  return NextResponse.json({
    configured: Boolean(clientId && clientSecret),
    clientId: clientId || null,
  });
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  return req
    .json()
    .catch(() => ({}))
    .then((b) => (b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {}));
}

/**
 * POST /api/auth/google — the ONLY way into HOME SYNC.
 * Exchanges a single-use authorization code with Google (client secret stays
 * server-side), reads the verified profile, upserts the real user, then
 * issues a server-verified session cookie. No guest, no demo, no local
 * password accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server." },
        { status: 503 }
      );
    }

    const body = await readJson(req);
    const code = String(body.code ?? "").trim();
    const redirectUri = String(body.redirectUri ?? "").trim();

    if (!code) {
      return NextResponse.json({ error: "Missing Google authorization code." }, { status: 400 });
    }
    if (!/^https?:\/\/[^\s/]+\/?$/.test(redirectUri)) {
      return NextResponse.json({ error: "Invalid redirect URI." }, { status: 400 });
    }

    // 1) Exchange the authorization code for tokens (server ↔ Google, over TLS).
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri.endsWith("/") ? redirectUri : `${redirectUri}/`,
        grant_type: "authorization_code",
      }),
    });
    const token = (await tokenRes.json().catch(() => ({}))) as GoogleTokenResponse;
    if (!tokenRes.ok || !token.access_token) {
      console.error("Google token exchange failed:", token.error, token.error_description);
      const reason =
        token.error === "invalid_client"
          ? "The Google keys on the server are incorrect. Please double-check the Client ID and Secret."
          : token.error === "invalid_grant"
            ? "That Google sign-in link expired. Please try again."
            : "Google rejected the sign-in. Please try again.";
      return NextResponse.json({ error: reason }, { status: 401 });
    }

    // 2) Read the verified profile from Google.
    const infoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!infoRes.ok) {
      console.error("Google userinfo fetch failed:", infoRes.status);
      return NextResponse.json({ error: "Could not read your Google profile. Please try again." }, { status: 401 });
    }
    const info = (await infoRes.json()) as GoogleUserInfo;
    const email = info.email?.trim().toLowerCase();
    if (!email || !info.email_verified) {
      return NextResponse.json(
        { error: "Your Google account has no verified email. Use a verified Google account." },
        { status: 400 }
      );
    }

    // 3) Upsert the real user (identity comes only from Google).
    const displayName = info.name?.trim().slice(0, 60) || email.split("@")[0];
    const photo = info.picture?.trim() || null;
    const user = await db.appUser.upsert({
      where: { email },
      create: { googleId: info.sub, email, name: displayName, photoUrl: photo },
      update: { googleId: info.sub, photoUrl: photo },
    });

    // 4) Issue a server-verified session (httpOnly cookie).
    const { token: sessionToken, expiresAt } = await createSession(user.id);

    // 5) Report any existing family context so the client can route.
    const membership = await db.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    const res = NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, photoUrl: user.photoUrl },
      membership: membership
        ? { role: membership.role, status: membership.status, familyId: membership.familyId }
        : null,
    });
    return setSessionCookie(res, sessionToken, expiresAt);
  } catch (e) {
    console.error("POST /api/auth/google failed:", e);
    return NextResponse.json({ error: "Google sign-in failed. Please try again." }, { status: 500 });
  }
}
