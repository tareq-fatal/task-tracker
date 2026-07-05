import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — pad to a fixed comparable
  // length first so unequal-length secrets don't short-circuit the timing.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Shared guard for the SYNC_SECRET-protected cron endpoints
 * (/api/sync/planner, /api/cron/recurring, /api/cron/notifications).
 * Rate-limited per IP as defense-in-depth in case the secret ever leaks.
 */
export function requireSyncSecret(req: NextRequest, routeKey: string): NextResponse | null {
  const secret = process.env.SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: `disabled (no SYNC_SECRET)` }, { status: 503 });
  }

  const limited = rateLimit(`cron:${routeKey}:${clientIp(req)}`, {
    limit: 30,
    windowSeconds: 60,
  });
  if (!limited.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const provided = req.headers.get("x-sync-secret") ?? "";
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
