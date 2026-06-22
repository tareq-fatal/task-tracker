import type { TaskPriority, TaskStatus } from "./enums";

/** Tailwind classes for status pills. */
export const STATUS_STYLES: Record<TaskStatus, string> = {
  Todo: "bg-sky-100 text-sky-700 border-sky-200",
  InProgress: "bg-amber-100 text-amber-700 border-amber-200",
  Done: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Archived: "bg-slate-100 text-slate-500 border-slate-200",
};

/** Tailwind classes for priority pills. */
export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  Low: "bg-slate-100 text-slate-600 border-slate-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Critical: "bg-red-100 text-red-700 border-red-200",
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

/** True when a task with this due date and status is overdue (not done/archived). */
export function isOverdue(
  dueDate: Date | string | null | undefined,
  status: TaskStatus,
  now: Date = new Date()
): boolean {
  if (!dueDate) return false;
  if (status === "Done" || status === "Archived") return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return d.getTime() < now.getTime();
}

/** True when the due date falls on the same calendar day as `now`. */
export function isDueToday(
  dueDate: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!dueDate) return false;
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/** Sort comparator: overdue first, then by priority, then by due date. */
export function compareTasks(
  a: { priority: string; dueDate: Date | string | null; status: string },
  b: { priority: string; dueDate: Date | string | null; status: string },
  now: Date = new Date()
): number {
  const ao = isOverdue(a.dueDate, a.status as TaskStatus, now) ? 0 : 1;
  const bo = isOverdue(b.dueDate, b.status as TaskStatus, now) ? 0 : 1;
  if (ao !== bo) return ao - bo;

  const ap = PRIORITY_ORDER[a.priority as TaskPriority] ?? 99;
  const bp = PRIORITY_ORDER[b.priority as TaskPriority] ?? 99;
  if (ap !== bp) return ap - bp;

  const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
  const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
  return ad - bd;
}

/** Initials for an avatar fallback. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
