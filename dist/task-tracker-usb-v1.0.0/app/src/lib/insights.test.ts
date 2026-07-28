import { describe, it, expect } from "vitest";
import { trend, velocityForecast, forecastDelta, burnoutRisk, rankBottleneck, effortVsReality } from "./insights";

describe("trend", () => {
  it("computes signed % change + direction", () => {
    expect(trend(120, 100)).toEqual({ deltaPct: 20, direction: "up" });
    expect(trend(80, 100)).toEqual({ deltaPct: -20, direction: "down" });
    expect(trend(100, 100)).toEqual({ deltaPct: 0, direction: "flat" });
  });
  it("handles a zero baseline", () => {
    expect(trend(0, 0)).toEqual({ deltaPct: 0, direction: "flat" });
    expect(trend(5, 0)).toEqual({ deltaPct: 100, direction: "up" });
  });
});

describe("velocityForecast + forecastDelta", () => {
  it("days left = ceil(remaining / perDay); 0 when done", () => {
    expect(velocityForecast(10, 2)).toBe(5);
    expect(velocityForecast(9, 2)).toBe(5);
    expect(velocityForecast(0, 2)).toBe(0);
  });
  it("null when stalled (no velocity)", () => {
    expect(velocityForecast(10, 0)).toBeNull();
  });
  it("forecastDelta: + = late, - = early", () => {
    const now = new Date("2026-07-02");
    const end = new Date("2026-07-10");
    expect(forecastDelta(5, now, end)).toBe(-3); // finishes 3 days early
    expect(forecastDelta(12, now, end)).toBe(4); // 4 days late
    expect(forecastDelta(null, now, end)).toBeNull();
    expect(forecastDelta(5, now, null)).toBeNull();
  });
});

describe("burnoutRisk", () => {
  const u = (open: number, overdue: number) => ({ userId: "u", name: "U", open, overdue });
  it("high when both open + overdue are elevated", () => {
    expect(burnoutRisk(u(10, 4))).toBe("high");
  });
  it("medium when only one is elevated", () => {
    expect(burnoutRisk(u(10, 0))).toBe("medium");
    expect(burnoutRisk(u(2, 4))).toBe("medium");
  });
  it("none when both are low", () => {
    expect(burnoutRisk(u(3, 1))).toBe("none");
  });
});

describe("rankBottleneck", () => {
  it("picks the non-terminal status with the oldest work", () => {
    const b = rankBottleneck([
      { status: "Todo", avgAgeDays: 2, count: 5 },
      { status: "InProgress", avgAgeDays: 9, count: 3 },
      { status: "Done", avgAgeDays: 40, count: 20 },
    ]);
    expect(b?.status).toBe("InProgress");
  });
  it("null when nothing is in progress", () => {
    expect(rankBottleneck([{ status: "Done", avgAgeDays: 5, count: 3 }])).toBeNull();
  });
});

describe("effortVsReality", () => {
  it("computes hours/point + ratio vs baseline", () => {
    const r = effortVsReality([{ storyPoints: 2, spentHours: 12 }, { storyPoints: 3, spentHours: 8 }]);
    expect(r?.sampleSize).toBe(2);
    expect(r?.hoursPerPoint).toBe(4); // 20h / 5pts
    expect(r?.ratio).toBe(1);
  });
  it("null when no task has both points + spent hours", () => {
    expect(effortVsReality([{ storyPoints: null, spentHours: 5 }])).toBeNull();
  });
});
