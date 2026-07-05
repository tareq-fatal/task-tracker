import type { TaskPriority, TaskStatus } from "./enums";

/** Tailwind classes for status pills. */
export const STATUS_STYLES: Record<TaskStatus, string> = {
  Todo: "bg-indigo-100 text-indigo-700 border-indigo-200",
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

/** Start-border accent colour per priority (visual hierarchy on cards). */
export const PRIORITY_ACCENT: Record<TaskPriority, string> = {
  Critical: "border-s-rose-400",
  High: "border-s-orange-400",
  Medium: "border-s-amber-400",
  Low: "border-s-slate-300",
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

/** Allowed manual progress steps (%). */
export const PROGRESS_STEPS = [0, 10, 25, 50, 75, 100] as const;

const HOURS_PER_DAY = 8;

/** Progress derived from subtask completion (0 when no subtasks). */
export function progressFromSubtasks(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/** Clamp a value into the 0-100 progress range (integer). */
export function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Parse a duration shorthand into hours.
 * Accepts "4h", "1d", "2d", "1.5h", "90m", or a plain number (= hours).
 * Returns null for empty/invalid input.
 */
export function parseDuration(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).trim().toLowerCase();
  if (s === "") return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(h|d|m)?$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (Number.isNaN(n) || n < 0) return null;
  const unit = m[2] ?? "h";
  if (unit === "d") return n * HOURS_PER_DAY;
  if (unit === "m") return n / 60;
  return n;
}

/** Format hours as a compact label: 8h → "1d", 16h → "2d", else "Xh". */
export function formatDuration(hours: number | null | undefined): string {
  if (hours == null || hours <= 0) return "0h";
  if (hours % HOURS_PER_DAY === 0 && hours >= HOURS_PER_DAY) {
    return `${hours / HOURS_PER_DAY}d`;
  }
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded}h`;
}

/** Whole-day difference (due - now), rounded up. Positive = days remaining. */
export function daysUntil(
  due: Date | string,
  now: Date = new Date()
): number {
  const d = typeof due === "string" ? new Date(due) : due;
  const ms = d.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** Whole days a task is overdue (>=1 once past due, rounded up). */
export function overdueDaysCount(
  due: Date | string,
  now: Date = new Date()
): number {
  const d = typeof due === "string" ? new Date(due) : due;
  const ms = now.getTime() - d.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Hours of a currently-running timer (since timerStartedAt). */
export function runningHours(
  timerStartedAt: Date | string | null | undefined,
  now: Date = new Date()
): number {
  if (!timerStartedAt) return 0;
  const d =
    typeof timerStartedAt === "string"
      ? new Date(timerStartedAt)
      : timerStartedAt;
  return Math.max(0, (now.getTime() - d.getTime()) / (60 * 60 * 1000));
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

/**
 * #12 — a comment is "read by everyone who should see it" when every intended
 * reader has a read-marker at/after the comment's creation time. Pure so it's
 * unit-testable. `reads` maps userId → their lastReadAt (epoch ms).
 */
export function commentReadByAll(
  commentCreatedAtMs: number,
  intendedReaderIds: string[],
  reads: Record<string, number>
): boolean {
  if (intendedReaderIds.length === 0) return false; // nobody else to read it
  return intendedReaderIds.every((id) => (reads[id] ?? 0) >= commentCreatedAtMs);
}
