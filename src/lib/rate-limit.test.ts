import { describe, it, expect } from "vitest";
import { createRateLimiter } from "./rate-limit";

describe("createRateLimiter — one action per window", () => {
  it("allows the first action for a fresh key", () => {
    const rl = createRateLimiter(60_000);
    expect(rl.check("a", 1_000)).toBe(true);
  });

  it("blocks a second action inside the window (fat-finger double-click)", () => {
    const rl = createRateLimiter(60_000);
    rl.mark("a", 1_000);
    expect(rl.check("a", 1_000)).toBe(false); // same instant
    expect(rl.check("a", 30_000)).toBe(false); // 29s later, still cooling down
    expect(rl.check("a", 60_999)).toBe(false); // 59.999s later
  });

  it("allows again once the window has fully elapsed", () => {
    const rl = createRateLimiter(60_000);
    rl.mark("a", 1_000);
    expect(rl.check("a", 61_000)).toBe(true); // exactly 60s later
  });

  it("tracks keys independently (one operator does not throttle another)", () => {
    const rl = createRateLimiter(60_000);
    rl.mark("a", 1_000);
    expect(rl.check("a", 2_000)).toBe(false);
    expect(rl.check("b", 2_000)).toBe(true);
  });
});
