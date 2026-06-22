import { describe, it, expect } from "vitest";
import {
  isOverdue,
  isDueToday,
  compareTasks,
  initials,
  PRIORITY_ORDER,
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
