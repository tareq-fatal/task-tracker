// Minimal "one action per window" gate, in-memory and process-scoped. It exists
// to turn a fat-finger double-click into a harmless no-op — NOT to stop a
// determined attacker (use a shared store for that). `now` is injectable so the
// behaviour is deterministic under test.

export type RateLimiter = {
  /** true if the key may act now (outside the cooldown window). */
  check(key: string, now?: number): boolean;
  /** record an action for the key, starting a fresh cooldown window. */
  mark(key: string, now?: number): void;
};

export function createRateLimiter(windowMs: number): RateLimiter {
  const last = new Map<string, number>();
  return {
    check(key, now = Date.now()) {
      const prev = last.get(key);
      return prev === undefined || now - prev >= windowMs;
    },
    mark(key, now = Date.now()) {
      last.set(key, now);
    },
  };
}
