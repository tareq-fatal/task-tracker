import { describe, it, expect } from "vitest";
import { sortTasks, type SortableRow } from "./table-sort";

const rows: SortableRow[] = [
  { title: "Beta", status: "Done", priority: "Low", dueDate: "2026-07-10", storyPoints: 3, assignedTo: { name: "Bob" } },
  { title: "alpha", status: "Todo", priority: "Critical", dueDate: "2026-07-01", storyPoints: 8, assignedTo: { name: "Alice" } },
  { title: "Gamma", status: "InProgress", priority: "Medium", dueDate: null, storyPoints: null, assignedTo: null },
];

describe("sortTasks", () => {
  it("title asc is case-insensitive", () => {
    expect(sortTasks(rows, "title", "asc").map((r) => r.title)).toEqual(["alpha", "Beta", "Gamma"]);
  });
  it("status follows workflow order", () => {
    expect(sortTasks(rows, "status", "asc").map((r) => r.status)).toEqual(["Todo", "InProgress", "Done"]);
  });
  it("priority: Critical first when asc", () => {
    expect(sortTasks(rows, "priority", "asc").map((r) => r.priority)).toEqual(["Critical", "Medium", "Low"]);
  });
  it("dueDate asc puts no-date rows last", () => {
    expect(sortTasks(rows, "dueDate", "asc").map((r) => r.title)).toEqual(["alpha", "Beta", "Gamma"]);
  });
  it("storyPoints desc; nulls last", () => {
    expect(sortTasks(rows, "storyPoints", "desc").map((r) => r.storyPoints)).toEqual([8, 3, null]);
  });
  it("assignee asc; unassigned last", () => {
    expect(sortTasks(rows, "assignee", "asc").map((r) => r.assignedTo?.name ?? null)).toEqual(["Alice", "Bob", null]);
  });
  it("desc reverses", () => {
    expect(sortTasks(rows, "title", "desc").map((r) => r.title)).toEqual(["Gamma", "Beta", "alpha"]);
  });
});
