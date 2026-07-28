import { describe, it, expect } from "vitest";
import {
  DAY_MS,
  startOfDay,
  addDays,
  diffDays,
  resolveSchedule,
  ganttWindow,
  xForMs,
  msForX,
  barGeometry,
  axisTicks,
  criticalPath,
  PX_PER_DAY,
} from "./gantt";

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString();
const ms = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe("date helpers", () => {
  it("startOfDay snaps to UTC midnight", () => {
    const t = Date.UTC(2026, 6, 5, 13, 47, 12);
    expect(startOfDay(t)).toBe(Date.UTC(2026, 6, 5));
  });
  it("addDays / diffDays round-trip", () => {
    const base = ms(2026, 7, 5);
    expect(diffDays(base, addDays(base, 10))).toBe(10);
    expect(diffDays(base, addDays(base, -3))).toBe(-3);
  });
});

describe("resolveSchedule", () => {
  it("uses startDate + dueDate when present", () => {
    const s = resolveSchedule({ startDate: iso(2026, 7, 1), dueDate: iso(2026, 7, 10), createdAt: iso(2026, 6, 1) });
    expect(s.start).toBe(ms(2026, 7, 1));
    expect(s.end).toBe(ms(2026, 7, 10));
  });
  it("falls back to createdAt for start", () => {
    const s = resolveSchedule({ startDate: null, dueDate: iso(2026, 7, 10), createdAt: iso(2026, 7, 3) });
    expect(s.start).toBe(ms(2026, 7, 3));
  });
  it("derives end from estimatedHours when no dueDate (8h = 1 day)", () => {
    const s = resolveSchedule({ startDate: iso(2026, 7, 1), dueDate: null, createdAt: iso(2026, 7, 1), estimatedHours: 24 });
    expect(diffDays(s.start, s.end)).toBe(3);
  });
  it("defaults to a 1-day bar with no dueDate / no estimate", () => {
    const s = resolveSchedule({ startDate: iso(2026, 7, 1), dueDate: null, createdAt: iso(2026, 7, 1) });
    expect(s.end - s.start).toBe(DAY_MS);
  });
  it("enforces a minimum 1-day bar even if due < start", () => {
    const s = resolveSchedule({ startDate: iso(2026, 7, 10), dueDate: iso(2026, 7, 1), createdAt: iso(2026, 7, 10) });
    expect(s.end).toBe(s.start + DAY_MS);
  });
});

describe("ganttWindow", () => {
  it("pads around task extent and always includes today", () => {
    const now = ms(2026, 7, 15);
    const w = ganttWindow([{ start: ms(2026, 7, 10), end: ms(2026, 7, 12) }], now, 3);
    expect(w.from).toBe(ms(2026, 7, 7)); // 10 - 3
    // today (15) forces the max out past 12
    expect(w.to).toBeGreaterThanOrEqual(ms(2026, 7, 15));
  });
  it("falls back to a range around now when empty", () => {
    const now = ms(2026, 7, 15);
    const w = ganttWindow([], now);
    expect(w.from).toBe(ms(2026, 7, 8));
    expect(w.to).toBe(ms(2026, 8, 14));
  });
});

describe("pixel scale", () => {
  it("xForMs / msForX round-trip on day boundaries", () => {
    const from = ms(2026, 7, 1);
    const ppd = PX_PER_DAY.day;
    const target = ms(2026, 7, 9);
    const x = xForMs(target, from, ppd);
    expect(x).toBe(8 * ppd);
    expect(msForX(x, from, ppd)).toBe(target);
  });
  it("msForX snaps sub-day pixels to the nearest day", () => {
    const from = ms(2026, 7, 1);
    const ppd = PX_PER_DAY.day;
    expect(msForX(ppd * 2 + ppd * 0.4, from, ppd)).toBe(ms(2026, 7, 3));
    expect(msForX(ppd * 2 + ppd * 0.6, from, ppd)).toBe(ms(2026, 7, 4));
  });
  it("barGeometry width spans the duration", () => {
    const from = ms(2026, 7, 1);
    const ppd = PX_PER_DAY.day;
    const g = barGeometry({ start: ms(2026, 7, 3), end: ms(2026, 7, 8) }, from, ppd);
    expect(g.x).toBe(2 * ppd);
    expect(g.width).toBe(5 * ppd);
  });
});

describe("axisTicks", () => {
  it("day zoom emits one tick per day and marks month starts major", () => {
    const from = ms(2026, 6, 29);
    const to = ms(2026, 7, 3);
    const ticks = axisTicks(from, to, "day", PX_PER_DAY.day);
    expect(ticks).toHaveLength(5); // 29,30,1,2,3
    const jul1 = ticks.find((t) => t.label.startsWith("Jul"));
    expect(jul1?.major).toBe(true);
  });
  it("month zoom emits month starts", () => {
    const ticks = axisTicks(ms(2026, 1, 15), ms(2026, 4, 2), "month", PX_PER_DAY.month);
    // Feb, Mar, Apr starts
    expect(ticks.map((t) => t.label.slice(0, 3))).toEqual(["Feb", "Mar", "Apr"]);
    expect(ticks.every((t) => t.major)).toBe(true);
  });
  it("returns nothing for an inverted range", () => {
    expect(axisTicks(ms(2026, 7, 10), ms(2026, 7, 1), "day", 40)).toEqual([]);
  });
});

describe("criticalPath (CPM)", () => {
  const T = (id: string, days: number) => ({ id, start: 0, end: days * DAY_MS });

  it("finds the longest dependency chain", () => {
    // A(2) → B(3) → D(2)  ;  A(2) → C(1) → D(2)
    // Path A-B-D = 7, A-C-D = 5 → critical: A,B,D
    const tasks = [T("A", 2), T("B", 3), T("C", 1), T("D", 2)];
    const deps = [
      { taskId: "B", dependsOnId: "A" },
      { taskId: "C", dependsOnId: "A" },
      { taskId: "D", dependsOnId: "B" },
      { taskId: "D", dependsOnId: "C" },
    ];
    const r = criticalPath(tasks, deps);
    expect(r.finish).toBe(7);
    expect([...r.critical].sort()).toEqual(["A", "B", "D"]);
    expect(r.critical.has("C")).toBe(false);
    expect(r.criticalEdges.has("A->B")).toBe(true);
    expect(r.criticalEdges.has("B->D")).toBe(true);
    expect(r.criticalEdges.has("A->C")).toBe(false);
  });

  it("marks only the longest independent task critical; shorter ones have slack", () => {
    const r = criticalPath([T("X", 2), T("Y", 5)], []);
    expect(r.finish).toBe(5);
    expect(r.critical.has("Y")).toBe(true); // longest → drives the schedule
    expect(r.critical.has("X")).toBe(false); // 3 days of slack
  });

  it("tolerates cycles without throwing", () => {
    const tasks = [T("A", 1), T("B", 1)];
    const deps = [
      { taskId: "B", dependsOnId: "A" },
      { taskId: "A", dependsOnId: "B" },
    ];
    const r = criticalPath(tasks, deps);
    expect(r.critical.size).toBe(0); // unresolved → non-critical, but no crash
  });

  it("dedupes parallel edges", () => {
    const tasks = [T("A", 1), T("B", 2)];
    const deps = [
      { taskId: "B", dependsOnId: "A" },
      { taskId: "B", dependsOnId: "A" },
    ];
    const r = criticalPath(tasks, deps);
    expect(r.finish).toBe(3);
    expect(r.criticalEdges.has("A->B")).toBe(true);
  });
});
