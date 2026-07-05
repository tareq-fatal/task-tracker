// Pure scrum-board logic: columns, status mapping, sticky styling, WIP. Tested.
import type { TaskStatus, TaskType } from "./enums";

export const SCRUM_COLUMNS = [
  { key: "to-do", emoji: "👀" },
  { key: "in-progress", emoji: "⏳" },
  { key: "waiting", emoji: "🚩" },
  { key: "to-verify", emoji: "🔍" },
  { key: "done", emoji: "✅" },
  { key: "ready-for-golive", emoji: "🚀" },
] as const;

export type ScrumColumn = (typeof SCRUM_COLUMNS)[number]["key"];
const KEYS = SCRUM_COLUMNS.map((c) => c.key) as ScrumColumn[];

export function isScrumColumn(v: string | null | undefined): v is ScrumColumn {
  return !!v && (KEYS as string[]).includes(v);
}

/** A task's scrum column: explicit `scrumColumn`, else derived from status. */
export function columnOf(task: { scrumColumn: string | null; status: string }): ScrumColumn {
  if (isScrumColumn(task.scrumColumn)) return task.scrumColumn;
  switch (task.status as TaskStatus) {
    case "InProgress": return "in-progress";
    case "Done": return "done";
    case "Archived": return "done";
    default: return "to-do";
  }
}

/** Keep `status` coherent when a card is dropped into a scrum column. */
export function statusForColumn(col: ScrumColumn): TaskStatus {
  if (col === "to-do") return "Todo";
  if (col === "done" || col === "ready-for-golive") return "Done";
  return "InProgress"; // in-progress | waiting | to-verify
}

/** Deterministic small rotation (deg) per id — avoids hydration mismatch. */
export function stickyRotation(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return ((h % 5) - 2) * 0.8; // -1.6 .. +1.6 deg
}

/** Pastel sticky background per task type. */
export const STICKY_COLOR: Record<TaskType, string> = {
  Story: "bg-amber-100 border-amber-200 dark:bg-amber-500/15 dark:border-amber-500/30",
  Task: "bg-sky-100 border-sky-200 dark:bg-sky-500/15 dark:border-sky-500/30",
  Epic: "bg-violet-100 border-violet-200 dark:bg-violet-500/15 dark:border-violet-500/30",
  Bug: "bg-rose-100 border-rose-200 dark:bg-rose-500/15 dark:border-rose-500/30",
  Subtask: "bg-emerald-100 border-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/30",
};

/** Soft WIP limits per column (0 = no limit). PR-AK will make these configurable. */
export const WIP_LIMIT: Record<ScrumColumn, number> = {
  "to-do": 0,
  "in-progress": 6,
  waiting: 0,
  "to-verify": 5,
  done: 0,
  "ready-for-golive": 0,
};

export function isOverWip(col: ScrumColumn, count: number): boolean {
  const lim = WIP_LIMIT[col];
  return lim > 0 && count > lim;
}
