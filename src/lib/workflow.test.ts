import { describe, it, expect } from "vitest";
import { WORKFLOW_TEMPLATES, columnForStatus, isOverWip } from "./workflow";

const cols = (status: string, isInitial = false, isFinal = false) => ({ status, isInitial, isFinal });

describe("WORKFLOW_TEMPLATES", () => {
  it("each template has exactly one initial and one final column", () => {
    for (const t of Object.values(WORKFLOW_TEMPLATES)) {
      expect(t.columns.filter((c) => c.isInitial)).toHaveLength(1);
      expect(t.columns.filter((c) => c.isFinal)).toHaveLength(1);
    }
  });
  it("has the advertised column counts", () => {
    expect(WORKFLOW_TEMPLATES.scrum6.columns).toHaveLength(6);
    expect(WORKFLOW_TEMPLATES.bugTriage5.columns).toHaveLength(5);
    expect(WORKFLOW_TEMPLATES.kanban3.columns).toHaveLength(3);
  });
});

describe("columnForStatus", () => {
  const columns = [cols("Todo", true), cols("Todo"), cols("InProgress"), cols("Done", false, true)];
  it("Todo → the initial Todo column", () => {
    expect(columnForStatus(columns, "Todo")).toBe(columns[0]);
  });
  it("Done/Archived → the final column", () => {
    expect(columnForStatus(columns, "Done")).toBe(columns[3]);
    expect(columnForStatus(columns, "Archived")).toBe(columns[3]);
  });
  it("InProgress → the matching column", () => {
    expect(columnForStatus(columns, "InProgress")).toBe(columns[2]);
  });
});

describe("isOverWip", () => {
  it("respects the limit; null = unlimited", () => {
    expect(isOverWip(6, 6)).toBe(true);
    expect(isOverWip(5, 6)).toBe(false);
    expect(isOverWip(999, null)).toBe(false);
    expect(isOverWip(999, undefined)).toBe(false);
  });
});
