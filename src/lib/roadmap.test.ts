import { describe, it, expect } from "vitest";
import { quarterTicks, barPct, laneRange, pct, roadmapWindow } from "./roadmap";

const Q = (y: number, m: number) => new Date(y, m, 1).getTime();
const DAY = 86400000;

describe("quarterTicks", () => {
  it("emits quarter labels across the window", () => {
    const ticks = quarterTicks(Q(2026, 0), Q(2026, 11)); // Jan–Dec 2026
    expect(ticks.map((t) => t.label)).toEqual(["Q1 2026", "Q2 2026", "Q3 2026", "Q4 2026"]);
    expect(ticks[0].xPct).toBeCloseTo(0, 0);
  });
  it("returns [] for an invalid window", () => {
    expect(quarterTicks(100, 100)).toEqual([]);
  });
});

describe("barPct", () => {
  it("clamps to the window and enforces a min width", () => {
    const { leftPct, widthPct } = barPct(Q(2026, 3), Q(2026, 6), Q(2026, 0), Q(2026, 11));
    expect(leftPct).toBeGreaterThan(0);
    expect(widthPct).toBeGreaterThanOrEqual(1.5);
    const tiny = barPct(Q(2026, 0), Q(2026, 0), Q(2026, 0), Q(2026, 11));
    expect(tiny.widthPct).toBe(1.5);
  });
});

describe("laneRange", () => {
  it("spans earliest createdAt to latest dueDate", () => {
    const r = laneRange(
      [{ createdAt: "2026-01-01", dueDate: "2026-03-01" }, { createdAt: "2026-02-01", dueDate: "2026-06-01" }],
      Q(2026, 0)
    );
    expect(r.start).toBe(Date.parse("2026-01-01"));
    expect(r.end).toBe(Date.parse("2026-06-01"));
  });
  it("uses createdAt when a task has no due date", () => {
    const r = laneRange([{ createdAt: "2026-05-01", dueDate: null }], 0);
    expect(r.start).toBe(Date.parse("2026-05-01"));
    expect(r.end).toBe(Date.parse("2026-05-01"));
  });
});

describe("pct", () => {
  it("computes completion %, 0 when empty", () => {
    expect(pct(3, 6)).toBe(50);
    expect(pct(0, 0)).toBe(0);
  });
});

describe("roadmapWindow (auto-zoom)", () => {
  const now = Q(2026, 6); // Jul 2026

  it("auto: fits lanes when the span is reasonable", () => {
    const w = roadmapWindow([{ start: Q(2026, 0), end: Q(2026, 11) }], now, "auto");
    expect(w.from).toBe(Q(2026, 0) - 14 * DAY);
    expect(w.to).toBe(Q(2026, 11) + 14 * DAY);
  });

  it("auto: CAPS a huge span (imported 2020 date) to a focused now-window, not 8 years", () => {
    const w = roadmapWindow([{ start: Q(2020, 6), end: Q(2027, 9) }], now, "auto");
    const years = (w.to - w.from) / (365 * DAY);
    expect(years).toBeLessThan(2.1); // ~2 years, NOT 8
    expect(w.from).toBeGreaterThan(Q(2025, 0)); // doesn't reach back to 2020
    expect(w.to).toBeGreaterThan(now); // still shows the future
  });

  it("presets center on now, biased to the future (¼ past, ¾ ahead)", () => {
    const w = roadmapWindow([], now, "1y");
    expect(Math.round((now - w.from) / DAY)).toBe(Math.round(365 * 0.25));
    expect(Math.round((w.to - now) / DAY)).toBe(Math.round(365 * 0.75));
  });

  it("empty + auto → a sensible default window", () => {
    const w = roadmapWindow([], now, "auto");
    expect(w.from).toBe(now - 30 * DAY);
    expect(w.to).toBe(now + 90 * DAY);
  });
});
