import { NextResponse } from "next/server";

/**
 * In-memory sliding-window rate limiter for sensitive endpoints
 * (auth exchange, invite/join, AI, place search).
 *
 * Single-node memory cache — adequate for this deployment tier. When moving
 * to a multi-instance production deployment, back this with a shared store.
 */

interface Window {
  hits: number[];
}

const windows = new Map<string, Window>();
let lastSweep = Date.now();

/** Periodically drop expired windows so the map cannot grow unbounded. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of windows) {
    w.hits = w.hits.filter((t) => now - t < 15 * 60_000);
    if (w.hits.length === 0) windows.delete(key);
  }
}

/**
 * Consume one slot. Returns null when allowed, or a 429 NextResponse when
 * the caller exceeded `limit` events in the last `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const now = Date.now();
  sweep(now);
  const w = windows.get(key) ?? { hits: [] };
  w.hits = w.hits.filter((t) => now - t < windowMs);
  if (w.hits.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((w.hits[0] + windowMs - now) / 1000));
    windows.set(key, w);
    return NextResponse.json(
      {
        error: `Too many requests. Try again in about ${retryAfterSec < 60 ? `${retryAfterSec} seconds` : `${Math.ceil(retryAfterSec / 60)} minutes`}.`,
      },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }
  w.hits.push(now);
  windows.set(key, w);
  return null;
}

/** Best-effort client identity for unauthenticated endpoints (OAuth start). */
export function clientKey(req: Request, bucket: string): string {
  const fwd =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${bucket}:${fwd}`;
}
