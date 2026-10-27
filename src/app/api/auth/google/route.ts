import { NextRequest, NextResponse } from "next/server";
import { ensureSeed } from "@/lib/homesync/seed";
import { db } from "@/lib/db";
import { readJson, serializeUser } from "../login/route";

export const dynamic = "force-dynamic";

const MUTED_COLORS = ["#64748b", "#8f7a99", "#6f9a80", "#a89462", "#6889a8", "#a8836a"];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
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

/**
 * POST /api/auth/google — REAL "Continue with Google".
 *
 * Flow (standard OAuth 2.0 Authorization Code, server-side exchange):
 *  1. The browser is sent to Google's consent page by the login screen.
 *  2. Google redirects back to the app with a single-use authorization code.
 *  3. This endpoint exchanges that code directly with Google using the
 *     client secret (never exposed to the browser), then fetches the
 *     verified profile (email, name, picture) from Google's userinfo API.
 *  4. The Google account is linked to the matching family account by email,
 *     or a new linked member is provisioned so any family member can join.
 *
 * The client NEVER picks its own email/name — identity always comes from
 * Google over TLS, so this is a real verified sign-in, not a demo.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureSeed();

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server settings.",
        },
        { status: 503 }
      );
    }

    const body = await readJson(req);
    const code = String(body.code ?? "").trim();
    const redirectUri = String(body.redirectUri ?? "").trim();

    if (!code) {
      return NextResponse.json({ error: "Missing Google authorization code." }, { status: 400 });
    }
    // The redirect_uri sent here must exactly match the one that started the flow.
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

    // 2) Fetch the verified profile from Google.
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
    const gName = info.name?.trim() ?? "";
    const gPicture = info.picture?.trim() || null;

    // 3) Link to the existing family account, or provision a new linked member.
    const existing = await db.appUser.findUnique({ where: { email } });
    if (existing) {
      const user = await db.appUser.update({
        where: { id: existing.id },
        data: {
          provider: "google",
          photoUrl: gPicture ?? existing.photoUrl,
        },
      });
      return NextResponse.json({ user: serializeUser(user) });
    }

    // New Google account — first real sign-up through Google.
    const displayName =
      gName ||
      email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    const color = MUTED_COLORS[Math.floor(Math.random() * MUTED_COLORS.length)];
    const role = "Parent";
    const member = await db.member.create({
      data: {
        name: displayName,
        relation: "Member",
        role,
        color,
        isAdmin: false,
        locationSharing: true,
        locationLabel: "Home • 24 Lakeview Avenue",
        locationUpdatedAt: new Date(),
      },
    });
    const user = await db.appUser.create({
      data: {
        email,
        password: "",
        provider: "google",
        name: displayName,
        role,
        relation: member.relation,
        color,
        photoUrl: gPicture,
        memberId: member.id,
      },
    });
    await db.activityLog.create({
      data: { actor: displayName, action: "joined via Google sign-in", target: "Our Home" },
    });
    return NextResponse.json({ user: serializeUser(user) });
  } catch (e) {
    console.error("POST /api/auth/google failed:", e);
    return NextResponse.json({ error: "Google sign-in failed. Please try again." }, { status: 500 });
  }
}
