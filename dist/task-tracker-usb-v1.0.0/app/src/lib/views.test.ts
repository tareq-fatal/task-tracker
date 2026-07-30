import { describe, it, expect } from "vitest";
import { monthMatrix, barPosition, timeTicks, todayPct } from "./views";

describe("monthMatrix", () => {
  it("returns 6 weeks of 7, Monday-start, flags in-month days", () => {
    const m = monthMatrix(2026, 5); // June 2026 (June 1 2026 is a Monday)
    expect(m).toHaveLength(6);
    expect(m[0]).toHaveLength(7);
    expect(m[0][0].date).toBe("2026-06-01"); // Monday start, no leading days
    expect(m[0][0].inMonth).toBe(true);
    const flat = m.flat();
    expect(flat.filter((c) => c.inMonth)).toHaveLength(30); // June has 30 days
  });
});

describe("barPosition", () => {
  const from = new Date("2026-06-01T00:00:00Z");
  const to = new Date("2026-06-11T00:00:00Z"); // 10-day window
  it("positions a bar by % of the window", () => {
    const p = barPosition(new Date("2026-06-03T00:00:00Z"), new Date("2026-06-05T00:00:00Z"), from, to)!;
    expect(p.left).toBeCloseTo(20, 1); // day 2 of 10
    expect(p.width).toBeCloseTo(20, 1); // 2 days of 10
  });
  it("clamps to the window and returns null when fully outside", () => {
    expect(barPosition(new Date("2026-05-01"), new Date("2026-05-10"), from, to)).toBeNull();
    const p = barPosition(new Date("2026-05-30"), new Date("2026-06-03"), from, to)!;
    expect(p.left).toBe(0);
  });
});

describe("timeTicks / todayPct", () => {
  const from = new Date("2026-01-01T00:00:00Z");
  const to = new Date("2026-12-31T00:00:00Z");
  it("makes evenly spaced ticks", () => {
    const ticks = timeTicks(from, to, 5);
    expect(ticks).toHaveLength(5);
    expect(ticks[0].pct).toBe(0);
    expect(ticks[4].pct).toBe(100);
  });
  it("locates today within the window, null outside", () => {
    expect(todayPct(new Date("2026-07-02T12:00:00Z"), from, to)).toBeGreaterThan(40);
    expect(todayPct(new Date("2025-01-01"), from, to)).toBeNull();
  });
});
