import { describe, it, expect } from "vitest";
import {
  bucketToStatus,
  resolveStatus,
  plannerPriority,
  parseChecklist,
  parsePlannerDate,
} from "./planner-import";

describe("bucketToStatus", () => {
  it("maps buckets per the SAP-B1 mapping (case/space-insensitive)", () => {
    expect(bucketToStatus("Backlog")).toBe("Todo");
    expect(bucketToStatus("on hold")).toBe("Todo");
    expect(bucketToStatus("In Klärung beim Besteller")).toBe("Todo");
    expect(bucketToStatus("In Bearbeitung")).toBe("InProgress");
    expect(bucketToStatus("Test & QS")).toBe("InProgress");
    expect(bucketToStatus("ready zum golive")).toBe("InProgress");
    expect(bucketToStatus("Erledigt")).toBe("Done");
    expect(bucketToStatus("Wiederkehrend")).toBe("Archived");
  });
  it("defaults unknown buckets to Todo", () => {
    expect(bucketToStatus("Etwas Neues")).toBe("Todo");
    expect(bucketToStatus("")).toBe("Todo");
    expect(bucketToStatus(null)).toBe("Todo");
  });
});

describe("resolveStatus", () => {
  it("lets a completed Planner status force Done", () => {
    expect(resolveStatus("In Bearbeitung", "Abgeschlossen")).toBe("Done");
  });
  it("keeps recurring bucket as Archived even if completed", () => {
    expect(resolveStatus("Wiederkehrend", "Abgeschlossen")).toBe("Archived");
  });
  it("uses the bucket when not completed", () => {
    expect(resolveStatus("In Bearbeitung", "In Bearbeitung")).toBe("InProgress");
    expect(resolveStatus("Backlog", "Nicht begonnen")).toBe("Todo");
  });
});

describe("plannerPriority", () => {
  it("maps the four Planner priorities", () => {
    expect(plannerPriority("Dringend")).toBe("Critical");
    expect(plannerPriority("Wichtig")).toBe("High");
    expect(plannerPriority("Mittel")).toBe("Medium");
    expect(plannerPriority("Niedrig")).toBe("Low");
    expect(plannerPriority("")).toBe("Medium");
  });
});

describe("parseChecklist", () => {
  it("parses X/Y ratios", () => {
    expect(parseChecklist("2/12")).toEqual({ done: 2, total: 12, progress: 17 });
    expect(parseChecklist("4/4")).toEqual({ done: 4, total: 4, progress: 100 });
  });
  it("handles empty/invalid", () => {
    expect(parseChecklist("")).toEqual({ done: 0, total: 0, progress: 0 });
    expect(parseChecklist("0/0")).toEqual({ done: 0, total: 0, progress: 0 });
    expect(parseChecklist(null)).toEqual({ done: 0, total: 0, progress: 0 });
  });
});

describe("parsePlannerDate", () => {
  it("parses ISO date strings", () => {
    const d = parsePlannerDate("2024-05-15");
    expect(d?.getUTCFullYear()).toBe(2024);
  });
  it("returns null for empty", () => {
    expect(parsePlannerDate("")).toBeNull();
    expect(parsePlannerDate(null)).toBeNull();
  });
});
