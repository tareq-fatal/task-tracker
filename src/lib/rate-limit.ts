import "server-only";
import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

// Single-instance in-memory limiter (fixed window). Sufficient for the
// current one-VPS deployment; swap for a shared store (Redis/Upstash) if
// this app ever runs multiple instances behind a load balancer.
const buckets = new Map<string, Bucket>();

// Periodic sweep so the map doesn't grow unbounded across long-lived processes.
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Fixed-window rate limit. `key` should already include the action name so
 * different limiters don't collide (e.g. `login:${ip}`).
 */
export function rateLimit(
  key: string,
  { limit, windowSeconds }: { limit: number; windowSeconds: number }
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count++;
  return { ok: true };
}

/** Best-effort client IP from the reverse proxy (nginx/Caddy sets this — see DEPLOY.md). */
export function clientIp(req?: Request): string {
  const h = req ? req.headers : headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = h.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
