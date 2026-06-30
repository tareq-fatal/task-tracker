import { describe, it, expect } from "vitest";
import { quarterTicks, barPct, laneRange, pct } from "./roadmap";

const Q = (y: number, m: number) => new Date(y, m, 1).getTime();

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
