import { describe, it, expect } from "vitest";
import {
  isOverdue,
  isDueToday,
  compareTasks,
  initials,
  PRIORITY_ORDER,
  progressFromSubtasks,
  clampProgress,
  parseDuration,
  formatDuration,
  daysUntil,
  overdueDaysCount,
  runningHours,
} from "./tasks";

const NOW = new Date("2026-06-23T12:00:00Z");

describe("isOverdue", () => {
  it("returns false when no due date", () => {
    expect(isOverdue(null, "Todo", NOW)).toBe(false);
  });

  it("returns true for past due open tasks", () => {
    expect(isOverdue("2026-06-20T12:00:00Z", "Todo", NOW)).toBe(true);
    expect(isOverdue("2026-06-22T12:00:00Z", "InProgress", NOW)).toBe(true);
  });

  it("returns false for future due dates", () => {
    expect(isOverdue("2026-06-25T12:00:00Z", "Todo", NOW)).toBe(false);
  });

  it("returns false for Done/Archived even if past", () => {
    expect(isOverdue("2026-06-01T12:00:00Z", "Done", NOW)).toBe(false);
    expect(isOverdue("2026-06-01T12:00:00Z", "Archived", NOW)).toBe(false);
  });
});

describe("isDueToday", () => {
  it("matches same calendar day", () => {
    expect(isDueToday("2026-06-23T08:00:00Z", NOW)).toBe(true);
  });
  it("rejects other days", () => {
    expect(isDueToday("2026-06-24T08:00:00Z", NOW)).toBe(false);
    expect(isDueToday(null, NOW)).toBe(false);
  });
});

describe("compareTasks", () => {
  it("orders overdue tasks first", () => {
    const overdue = { priority: "Low", dueDate: "2026-06-01", status: "Todo" };
    const future = { priority: "Critical", dueDate: "2026-07-01", status: "Todo" };
    expect(compareTasks(overdue, future, NOW)).toBeLessThan(0);
  });

  it("orders by priority when neither overdue", () => {
    const high = { priority: "High", dueDate: null, status: "Todo" };
    const low = { priority: "Low", dueDate: null, status: "Todo" };
    expect(compareTasks(high, low, NOW)).toBeLessThan(0);
    expect(PRIORITY_ORDER.Critical).toBeLessThan(PRIORITY_ORDER.Low);
  });

  it("orders by due date within same priority", () => {
    const sooner = { priority: "Medium", dueDate: "2026-07-01", status: "Todo" };
    const later = { priority: "Medium", dueDate: "2026-08-01", status: "Todo" };
    expect(compareTasks(sooner, later, NOW)).toBeLessThan(0);
  });
});

describe("initials", () => {
  it("takes first two name parts", () => {
    expect(initials("Alice Müller")).toBe("AM");
    expect(initials("Bob")).toBe("B");
    expect(initials("a b c")).toBe("AB");
    expect(initials("")).toBe("");
  });
});

describe("progressFromSubtasks", () => {
  it("computes percentage and rounds", () => {
    expect(progressFromSubtasks(3, 5)).toBe(60);
    expect(progressFromSubtasks(1, 3)).toBe(33);
    expect(progressFromSubtasks(0, 4)).toBe(0);
    expect(progressFromSubtasks(4, 4)).toBe(100);
  });
  it("returns 0 with no subtasks", () => {
    expect(progressFromSubtasks(0, 0)).toBe(0);
  });
});

describe("clampProgress", () => {
  it("clamps and rounds", () => {
    expect(clampProgress(-5)).toBe(0);
    expect(clampProgress(150)).toBe(100);
    expect(clampProgress(49.6)).toBe(50);
    expect(clampProgress(NaN)).toBe(0);
  });
});

describe("parseDuration", () => {
  it("parses hours, days, minutes", () => {
    expect(parseDuration("4h")).toBe(4);
    expect(parseDuration("1d")).toBe(8);
    expect(parseDuration("2d")).toBe(16);
    expect(parseDuration("90m")).toBe(1.5);
    expect(parseDuration("1.5h")).toBe(1.5);
    expect(parseDuration("3")).toBe(3);
  });
  it("returns null for empty/invalid", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("-2h")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("formats compactly", () => {
    expect(formatDuration(4)).toBe("4h");
    expect(formatDuration(8)).toBe("1d");
    expect(formatDuration(16)).toBe("2d");
    expect(formatDuration(1.5)).toBe("1.5h");
    expect(formatDuration(0)).toBe("0h");
    expect(formatDuration(null)).toBe("0h");
  });
});

describe("daysUntil / overdueDaysCount", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  it("counts days remaining", () => {
    expect(daysUntil("2026-06-27T12:00:00Z", now)).toBe(3);
    expect(daysUntil("2026-06-24T18:00:00Z", now)).toBe(1);
  });
  it("counts overdue days", () => {
    expect(overdueDaysCount("2026-06-22T12:00:00Z", now)).toBe(2);
    expect(overdueDaysCount("2026-06-25T12:00:00Z", now)).toBe(0);
  });
});

describe("runningHours", () => {
  const now = new Date("2026-06-24T12:00:00Z");
  it("returns elapsed hours since start", () => {
    expect(runningHours("2026-06-24T10:00:00Z", now)).toBeCloseTo(2, 5);
    expect(runningHours(null, now)).toBe(0);
  });
});
