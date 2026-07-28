import { describe, it, expect } from "vitest";
import {
  buildHeatmap,
  heatLevel,
  distribution,
  productivityScore,
  topProjects,
  completionPrediction,
  currentStreak,
} from "./infographics";

describe("buildHeatmap / heatLevel / currentStreak", () => {
  const from = new Date("2026-06-01T00:00:00Z");
  const to = new Date("2026-06-05T00:00:00Z");
  it("buckets events per UTC day across the range", () => {
    const cells = buildHeatmap(
      [new Date("2026-06-02T09:00:00Z"), new Date("2026-06-02T20:00:00Z"), new Date("2026-06-04T01:00:00Z")],
      from,
      to
    );
    expect(cells.map((c) => c.date)).toEqual([
      "2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05",
    ]);
    expect(cells.find((c) => c.date === "2026-06-02")!.count).toBe(2);
    expect(cells.find((c) => c.date === "2026-06-04")!.count).toBe(1);
    expect(cells.find((c) => c.date === "2026-06-01")!.count).toBe(0);
  });
  it("heatLevel scales 0-4 by ratio to max", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 10)).toBe(1);
    expect(heatLevel(5, 10)).toBe(2);
    expect(heatLevel(8, 10)).toBe(4);
  });
  it("currentStreak counts trailing non-zero days", () => {
    expect(currentStreak([{ date: "a", count: 0 }, { date: "b", count: 2 }, { date: "c", count: 1 }])).toBe(2);
    expect(currentStreak([{ date: "a", count: 1 }, { date: "b", count: 0 }])).toBe(0);
  });
});

describe("distribution", () => {
  it("counts by key in the given order, dropping empties", () => {
    const d = distribution(
      [{ status: "Todo" }, { status: "Done" }, { status: "Done" }],
      "status",
      ["Todo", "InProgress", "Done", "Archived"]
    );
    expect(d).toEqual([{ name: "Todo", value: 1 }, { name: "Done", value: 2 }]);
  });
});

describe("productivityScore", () => {
  it("is 100 for all-done, all-on-time, active", () => {
    expect(productivityScore({ total: 10, done: 10, onTime: 5, withDue: 5, activeDays: 20, windowDays: 30 })).toBe(100);
  });
  it("blends partial completion / on-time / activity", () => {
    const s = productivityScore({ total: 10, done: 5, onTime: 2, withDue: 4, activeDays: 5, windowDays: 30 });
    // completion .5*40=20 + onTime .5*40=20 + activity (5/20)*20=5 => 45
    expect(s).toBe(45);
  });
});

describe("topProjects / completionPrediction", () => {
  it("ranks projects by task count", () => {
    expect(
      topProjects([{ projectName: "A" }, { projectName: "B" }, { projectName: "A" }, { projectName: null }])
    ).toEqual([{ name: "A", count: 2 }, { name: "B", count: 1 }]);
  });
  it("predicts days left from recent rate", () => {
    expect(completionPrediction(100, 40, 30, 10)).toEqual({ remaining: 60, perDay: 3, daysLeft: 20 });
    expect(completionPrediction(10, 5, 0, 10).daysLeft).toBeNull();
  });
});
