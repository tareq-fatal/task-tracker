// Custom per-project workflow columns: templates + pure helpers. Unit-tested.
import type { TaskStatus } from "./enums";

export type ColumnSpec = {
  name: string;
  color: string;
  status: TaskStatus; // underlying base status this column maps to
  wipLimit?: number;
  isInitial?: boolean; // new tasks land here
  isFinal?: boolean; // tasks here count as completed
};

export type TemplateKey = "scrum6" | "bugTriage5" | "kanban3";

export const WORKFLOW_TEMPLATES: Record<TemplateKey, { label: string; columns: ColumnSpec[] }> = {
  scrum6: {
    label: "Scrum 6",
    columns: [
      { name: "Backlog", color: "#94a3b8", status: "Todo", isInitial: true },
      { name: "To Do", color: "#6366f1", status: "Todo" },
      { name: "In Progress", color: "#3b82f6", status: "InProgress", wipLimit: 6 },
      { name: "Review", color: "#a855f7", status: "InProgress", wipLimit: 4 },
      { name: "Testing", color: "#f59e0b", status: "InProgress" },
      { name: "Done", color: "#10b981", status: "Done", isFinal: true },
    ],
  },
  bugTriage5: {
    label: "Bug-Triage 5",
    columns: [
      { name: "New", color: "#ef4444", status: "Todo", isInitial: true },
      { name: "Triaged", color: "#f59e0b", status: "Todo" },
      { name: "In Progress", color: "#3b82f6", status: "InProgress", wipLimit: 5 },
      { name: "Verify", color: "#a855f7", status: "InProgress" },
      { name: "Closed", color: "#10b981", status: "Done", isFinal: true },
    ],
  },
  kanban3: {
    label: "Kanban 3",
    columns: [
      { name: "To Do", color: "#6366f1", status: "Todo", isInitial: true },
      { name: "Doing", color: "#3b82f6", status: "InProgress", wipLimit: 3 },
      { name: "Done", color: "#10b981", status: "Done", isFinal: true },
    ],
  },
};

/** Pick the column an existing task should land in when a template is first
 *  applied: match by base status, preferring the initial/final markers. */
export function columnForStatus<T extends { status: string; isInitial: boolean; isFinal: boolean }>(
  columns: T[],
  status: string
): T | undefined {
  if (status === "Todo") return columns.find((c) => c.status === "Todo" && c.isInitial) ?? columns.find((c) => c.status === "Todo");
  if (status === "Done" || status === "Archived") return columns.find((c) => c.isFinal) ?? columns.find((c) => c.status === "Done");
  return columns.find((c) => c.status === status) ?? columns.find((c) => c.status === "InProgress");
}

/** Whether adding one more task to a column would exceed its WIP limit. */
export function isOverWip(count: number, wipLimit: number | null | undefined): boolean {
  return wipLimit != null && count >= wipLimit;
}
