import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildTaskWorkbook } from "./excel";
import { makeExportT } from "./i18n-export";
import type { TaskRow } from "./data";

function row(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Task",
    status: "Todo",
    priority: "Medium",
    type: "Task",
    projectName: "Alpha",
    assigneeName: "Sam",
    teamName: null,
    sprintName: null,
    dueDate: null,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    completedAt: null,
    storyPoints: 3,
    estimatedHours: null,
    spentHours: 0,
    progress: 50,
    ...over,
  };
}

const meta = (groupBy: "none" | "status" | "priority" | "project" | "assignee") => ({
  t: makeExportT("en"),
  locale: "en",
  tenantName: "Objektus",
  filters: {},
  groupBy,
});

function read(buf: Buffer) {
  return XLSX.read(buf, { type: "buffer" });
}

describe("buildTaskWorkbook", () => {
  it("returns a valid xlsx buffer with a summary + tasks sheet", () => {
    const buf = buildTaskWorkbook([row(), row({ status: "Done" })], meta("none"));
    expect(Buffer.isBuffer(buf)).toBe(true);
    const wb = read(buf);
    expect(wb.SheetNames.length).toBe(2);
  });

  it("applies an AutoFilter in flat (ungrouped) mode", () => {
    const buf = buildTaskWorkbook([row(), row()], meta("none"));
    const wb = read(buf);
    const tasks = wb.Sheets[wb.SheetNames[1]];
    expect(tasks["!autofilter"]).toBeTruthy();
  });

  it("emits group header rows when grouping", () => {
    const buf = buildTaskWorkbook(
      [row({ status: "Todo" }), row({ status: "Done" }), row({ status: "Done" })],
      meta("status")
    );
    const wb = read(buf);
    const tasks = wb.Sheets[wb.SheetNames[1]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(tasks, { header: 1, blankrows: true });
    const flat = aoa.flat().filter((c) => typeof c === "string") as string[];
    // Two status groups → two "▸ …" header rows.
    const groupRows = flat.filter((c) => c.startsWith("▸"));
    expect(groupRows.length).toBe(2);
    // Grouped mode uses outline levels instead of an AutoFilter.
    expect(tasks["!autofilter"]).toBeFalsy();
  });

  it("sets a right-to-left workbook view for Arabic", () => {
    const buf = buildTaskWorkbook([row()], { ...meta("none"), t: makeExportT("ar"), locale: "ar" });
    const wb = read(buf);
    expect(wb.Workbook?.Views?.[0]?.RTL).toBe(true);
  });
});
