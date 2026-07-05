import { describe, it, expect } from "vitest";
import { fmtDate, exportBaseName } from "./util";

describe("fmtDate", () => {
  it("returns an em dash for null", () => {
    expect(fmtDate("en", null)).toBe("—");
    expect(fmtDate("ar", undefined)).toBe("—");
  });
  it("formats a real date without throwing", () => {
    const d = new Date("2026-07-05T00:00:00Z");
    for (const loc of ["ar", "en", "de"] as const) {
      expect(fmtDate(loc, d).length).toBeGreaterThan(0);
    }
  });
});

describe("exportBaseName", () => {
  it("builds a safe slug-and-date base name", () => {
    const now = new Date("2026-07-05T10:00:00Z");
    expect(exportBaseName("tasks", "objektus", now)).toBe("tasks-objektus-2026-07-05");
  });
  it("strips unsafe characters from the slug", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    expect(exportBaseName("sprint", "A/C me!", now)).toBe("sprint-acme-2026-01-02");
  });
  it("falls back when the slug is empty", () => {
    const now = new Date("2026-01-02T00:00:00Z");
    expect(exportBaseName("kanban", "@@@", now)).toBe("kanban-tenant-2026-01-02");
  });
});
