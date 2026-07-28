import { describe, it, expect } from "vitest";
import {
  completedInRange,
  totalCompleted,
  onTimeRate,
  avgCompletionDays,
  overdueCount,
  productivityByDay,
  topProjects,
  dayKey,
} from "./performance";

const NOW = new Date("2026-06-24T12:00:00Z");

function task(p: Partial<any> = {}) {
  return {
    createdAt: "2026-06-01T12:00:00Z",
    completedAt: null,
    dueDate: null,
    status: "Todo",
    ...p,
  };
}

describe("completedInRange / totalCompleted", () => {
  const tasks = [
    task({ completedAt: "2026-06-23T12:00:00Z", status: "Done" }), // 1d ago
    task({ completedAt: "2026-06-10T12:00:00Z", status: "Done" }), // 14d ago
    task({ completedAt: "2026-03-01T12:00:00Z", status: "Done" }), // ~115d ago
    task({ completedAt: null }),
  ];
  it("counts within window", () => {
    expect(completedInRange(tasks, 7, NOW)).toBe(1);
    expect(completedInRange(tasks, 30, NOW)).toBe(2);
    expect(completedInRange(tasks, 90, NOW)).toBe(2);
  });
  it("totals all completed", () => {
    expect(totalCompleted(tasks)).toBe(3);
  });
});

describe("onTimeRate", () => {
  it("is null without dued completed tasks", () => {
    expect(onTimeRate([task({ completedAt: "2026-06-20", status: "Done" })])).toBeNull();
  });
  it("computes percentage on dued completed tasks", () => {
    const tasks = [
      task({ completedAt: "2026-06-10T00:00:00Z", dueDate: "2026-06-12T00:00:00Z", status: "Done" }), // on time
      task({ completedAt: "2026-06-15T00:00:00Z", dueDate: "2026-06-12T00:00:00Z", status: "Done" }), // late
      task({ completedAt: "2026-06-09T00:00:00Z", dueDate: "2026-06-12T00:00:00Z", status: "Done" }), // on time
    ];
    const r = onTimeRate(tasks)!;
    expect(r.sample).toBe(3);
    expect(r.rate).toBe(67);
  });
});

describe("avgCompletionDays", () => {
  it("averages completion span", () => {
    const tasks = [
      task({ createdAt: "2026-06-01T00:00:00Z", completedAt: "2026-06-05T00:00:00Z" }), // 4d
      task({ createdAt: "2026-06-01T00:00:00Z", completedAt: "2026-06-03T00:00:00Z" }), // 2d
    ];
    expect(avgCompletionDays(tasks)).toBe(3);
  });
  it("is null with no completed", () => {
    expect(avgCompletionDays([task()])).toBeNull();
  });
});

describe("overdueCount", () => {
  it("counts open past-due tasks only", () => {
    const tasks = [
      task({ dueDate: "2026-06-20T00:00:00Z", status: "Todo" }), // overdue
      task({ dueDate: "2026-06-20T00:00:00Z", status: "Done" }), // done, ignore
      task({ dueDate: "2026-06-30T00:00:00Z", status: "Todo" }), // future
      task({ dueDate: null, status: "InProgress" }),
    ];
    expect(overdueCount(tasks, NOW)).toBe(1);
  });
});

describe("productivityByDay", () => {
  it("buckets completions per day with zeros", () => {
    const tasks = [
      task({ completedAt: "2026-06-24T09:00:00Z", status: "Done" }),
      task({ completedAt: "2026-06-24T15:00:00Z", status: "Done" }),
      task({ completedAt: "2026-06-23T10:00:00Z", status: "Done" }),
    ];
    const buckets = productivityByDay(tasks, 7, NOW);
    expect(buckets).toHaveLength(7);
    expect(buckets[buckets.length - 1].key).toBe(dayKey(NOW));
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(3);
  });
});

describe("topProjects", () => {
  it("ranks projects by count", () => {
    const p1 = { id: "p1", name: "A", color: "#000" };
    const p2 = { id: "p2", name: "B", color: "#111" };
    const tasks = [
      { project: p1 },
      { project: p1 },
      { project: p2 },
      { project: null },
    ];
    const top = topProjects(tasks, 5);
    expect(top[0].id).toBe("p1");
    expect(top[0].count).toBe(2);
    expect(top).toHaveLength(2);
  });
});
