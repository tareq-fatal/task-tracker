import { describe, it, expect } from "vitest";
import {
  computeKpis,
  burndownSeries,
  workloadByUser,
  type ReportTask,
} from "./reports";

const now = new Date("2026-06-26T12:00:00Z"); // Friday

function t(p: Partial<ReportTask>): ReportTask {
  return {
    status: "Todo",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    completedAt: null,
    dueDate: null,
    assignedToUserId: null,
    ...p,
  };
}

describe("computeKpis", () => {
  it("counts totals, done, open, this-week, overdue, avg completion", () => {
    const tasks = [
      t({ status: "Todo", dueDate: new Date("2026-06-20T00:00:00Z") }), // overdue
      t({ status: "InProgress" }),
      t({
        status: "Done",
        createdAt: new Date("2026-06-20T00:00:00Z"),
        completedAt: new Date("2026-06-24T00:00:00Z"), // this week (week starts Mon 22nd)
      }),
      t({
        status: "Done",
        createdAt: new Date("2026-06-01T00:00:00Z"),
        completedAt: new Date("2026-06-05T00:00:00Z"), // older
      }),
      t({ status: "Archived", dueDate: new Date("2026-01-01T00:00:00Z") }), // not overdue (archived)
    ];
    const k = computeKpis(tasks, now);
    expect(k.total).toBe(5);
    expect(k.done).toBe(2);
    expect(k.open).toBe(3);
    expect(k.doneThisWeek).toBe(1);
    expect(k.overdue).toBe(1);
    expect(k.avgCompletionDays).toBe(4); // (4 + 4) / 2
  });

  it("avgCompletionDays is null with no completed tasks", () => {
    expect(computeKpis([t({}), t({})], now).avgCompletionDays).toBeNull();
  });
});

describe("burndownSeries", () => {
  it("produces one point per day and tracks open vs done", () => {
    const tasks = [
      t({ createdAt: new Date("2026-06-24T00:00:00Z"), completedAt: new Date("2026-06-25T10:00:00Z"), status: "Done" }),
      t({ createdAt: new Date("2026-06-24T00:00:00Z") }),
    ];
    const series = burndownSeries(tasks, now, 3); // 24,25,26
    expect(series.map((p) => p.date)).toEqual(["2026-06-24", "2026-06-25", "2026-06-26"]);
    expect(series[0]).toMatchObject({ open: 2, done: 0 }); // both open on the 24th
    expect(series[2]).toMatchObject({ open: 1, done: 1 }); // one done by the 26th
  });

  it("ignores tasks not yet created on a given day", () => {
    const series = burndownSeries(
      [t({ createdAt: new Date("2026-06-26T00:00:00Z") })],
      now,
      3
    );
    expect(series[0].open).toBe(0); // didn't exist on the 24th
    expect(series[2].open).toBe(1);
  });
});

describe("workloadByUser", () => {
  it("buckets per user by status, excludes unassigned, sorts by total", () => {
    const rows = workloadByUser(
      [
        t({ assignedToUserId: "u1", status: "Todo" }),
        t({ assignedToUserId: "u1", status: "InProgress" }),
        t({ assignedToUserId: "u2", status: "Done" }),
        t({ assignedToUserId: null, status: "Todo" }), // excluded
      ],
      (id) => (id === "u1" ? "Alice" : "Bob")
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Alice", todo: 1, inProgress: 1, total: 2 });
    expect(rows[1]).toMatchObject({ name: "Bob", done: 1, total: 1 });
  });
});
