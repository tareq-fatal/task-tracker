import { describe, it, expect } from "vitest";
import { columnOf, statusForColumn, stickyRotation, isOverWip, isScrumColumn, SCRUM_COLUMNS } from "./scrum";

describe("columnOf", () => {
  it("uses explicit scrumColumn when valid", () => {
    expect(columnOf({ scrumColumn: "to-verify", status: "Todo" })).toBe("to-verify");
  });
  it("derives from status when scrumColumn null/invalid", () => {
    expect(columnOf({ scrumColumn: null, status: "InProgress" })).toBe("in-progress");
    expect(columnOf({ scrumColumn: "garbage", status: "Done" })).toBe("done");
    expect(columnOf({ scrumColumn: null, status: "Todo" })).toBe("to-do");
  });
});

describe("statusForColumn", () => {
  it("maps the 6 columns to 3 statuses", () => {
    expect(statusForColumn("to-do")).toBe("Todo");
    expect(statusForColumn("in-progress")).toBe("InProgress");
    expect(statusForColumn("waiting")).toBe("InProgress");
    expect(statusForColumn("to-verify")).toBe("InProgress");
    expect(statusForColumn("done")).toBe("Done");
    expect(statusForColumn("ready-for-golive")).toBe("Done");
  });
});

describe("stickyRotation", () => {
  it("is deterministic and within ±2°", () => {
    const a = stickyRotation("abc123");
    expect(stickyRotation("abc123")).toBe(a);
    for (const id of ["x", "task-1", "cmq9", "zzzz"]) {
      expect(Math.abs(stickyRotation(id))).toBeLessThanOrEqual(2);
    }
  });
});

describe("isOverWip / isScrumColumn", () => {
  it("flags over-limit only for limited columns", () => {
    expect(isOverWip("in-progress", 7)).toBe(true);
    expect(isOverWip("in-progress", 6)).toBe(false);
    expect(isOverWip("to-do", 100)).toBe(false); // no limit
  });
  it("validates column keys", () => {
    expect(isScrumColumn("done")).toBe(true);
    expect(isScrumColumn("nope")).toBe(false);
    expect(SCRUM_COLUMNS).toHaveLength(6);
  });
});
