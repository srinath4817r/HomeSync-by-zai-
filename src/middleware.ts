import { NextRequest, NextResponse } from "next/server";

/**
 * Logs the public address the app is browsed from (host + path), so the
 * owner can register the exact Authorized redirect URI in Google Console.
 * Only logs page requests for "/" and skips localhost noise.
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === "/") {
    const host = req.headers.get("host");
    if (host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1")) {
      const proto = req.headers.get("x-forwarded-proto") ?? "http";
      console.log(`[public-url] ${proto}://${host}/`);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
