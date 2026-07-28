import type { Locale } from "@/lib/enums";

/** The four export deliverables. */
export const EXPORT_KINDS = [
  "tasks-excel",
  "sprint-pdf",
  "activity-pdf",
  "kanban-pdf",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export function isExportKind(v: unknown): v is ExportKind {
  return typeof v === "string" && (EXPORT_KINDS as readonly string[]).includes(v);
}

export const EXPORT_FORMAT: Record<ExportKind, "xlsx" | "pdf"> = {
  "tasks-excel": "xlsx",
  "sprint-pdf": "pdf",
  "activity-pdf": "pdf",
  "kanban-pdf": "pdf",
};

/**
 * Above this many in-scope tasks an export is generated asynchronously (queued +
 * emailed) instead of inline. Overridable via env for tuning/tests.
 */
export const EXPORT_SYNC_LIMIT = Number(process.env.EXPORT_SYNC_LIMIT) || 100;

/** Grouping options for the Excel task list. */
export const TASK_GROUP_BY = ["none", "status", "priority", "project", "assignee"] as const;
export type TaskGroupBy = (typeof TASK_GROUP_BY)[number];

export function isTaskGroupBy(v: unknown): v is TaskGroupBy {
  return typeof v === "string" && (TASK_GROUP_BY as readonly string[]).includes(v);
}

/** User-supplied filters for the task-list export (all optional). */
export type TaskExportFilters = {
  status?: string | null; // Todo | InProgress | Done | Archived
  priority?: string | null; // Low | Medium | High | Critical
  projectId?: string | null;
  teamId?: string | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  search?: string | null;
};

/** Everything needed to produce one export, resolved from the request body. */
export type ExportParams = {
  kind: ExportKind;
  locale: Locale;
  includeLogo: boolean;
  // task-list (Excel)
  filters?: TaskExportFilters;
  groupBy?: TaskGroupBy;
  // sprint report
  sprintId?: string | null;
  // user-activity report
  targetUserId?: string | null;
  activityDays?: number; // window, default 30
  // kanban snapshot
  projectId?: string | null;
};

/** Output of a generator: the bytes plus how to label/serve them. */
export type GeneratedFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
  /** Number of tasks that went into the file (for the job record). */
  taskCount: number;
};

export const CONTENT_TYPE = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
} as const;
