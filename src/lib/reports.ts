// Pure reporting/aggregation helpers for /reports + dashboard KPI cards.
// No DB access — callers pass plain task rows so this stays unit-testable.
import type { TaskStatus } from "./enums";

export type ReportTask = {
  status: TaskStatus;
  createdAt: Date;
  completedAt: Date | null;
  dueDate: Date | null;
  assignedToUserId: string | null;
  estimatedHours?: number | null;
  spentHours?: number;
};

export type Kpis = {
  total: number;
  done: number;
  open: number;
  doneThisWeek: number;
  overdue: number;
  avgCompletionDays: number | null; // average createdAt→completedAt in days
};

const DAY = 24 * 60 * 60 * 1000;

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCHours(0, 0, 0, 0);
  return new Date(d.getTime() - dow * DAY);
}

export function computeKpis(tasks: ReportTask[], now: Date): Kpis {
  const weekStart = startOfWeek(now);
  let done = 0,
    doneThisWeek = 0,
    overdue = 0,
    completionDaysSum = 0,
    completedCount = 0;

  for (const t of tasks) {
    const isDone = t.status === "Done";
    if (isDone) done++;
    if (isDone && t.completedAt && t.completedAt >= weekStart) doneThisWeek++;
    if (!isDone && t.status !== "Archived" && t.dueDate && t.dueDate < now) overdue++;
    if (isDone && t.completedAt) {
      completionDaysSum += (t.completedAt.getTime() - t.createdAt.getTime()) / DAY;
      completedCount++;
    }
  }

  const total = tasks.length;
  return {
    total,
    done,
    open: total - done,
    doneThisWeek,
    overdue,
    avgCompletionDays:
      completedCount > 0
        ? Math.round((completionDaysSum / completedCount) * 10) / 10
        : null,
  };
}

export type BurndownPoint = { date: string; open: number; done: number };

/**
 * Daily open/done counts over the last `days` (inclusive of today). A task
 * counts as "open" on day D if it existed (createdAt <= end of D) and was not
 * yet completed (completedAt == null || completedAt > end of D).
 */
export function burndownSeries(
  tasks: ReportTask[],
  now: Date,
  days = 30
): BurndownPoint[] {
  const points: BurndownPoint[] = [];
  const today = new Date(now);
  today.setUTCHours(23, 59, 59, 999);

  for (let i = days - 1; i >= 0; i--) {
    const end = new Date(today.getTime() - i * DAY);
    let open = 0,
      done = 0;
    for (const t of tasks) {
      if (t.createdAt > end) continue; // didn't exist yet
      if (t.completedAt && t.completedAt <= end) done++;
      else open++;
    }
    points.push({ date: end.toISOString().slice(0, 10), open, done });
  }
  return points;
}

export type WorkloadRow = {
  userId: string;
  todo: number;
  inProgress: number;
  done: number;
  total: number;
};

/** Per-user current task counts by status (for a stacked bar). */
export function workloadByUser(
  tasks: ReportTask[],
  nameOf: (userId: string) => string
): Array<WorkloadRow & { name: string }> {
  const map = new Map<string, WorkloadRow>();
  for (const t of tasks) {
    if (!t.assignedToUserId) continue;
    const row =
      map.get(t.assignedToUserId) ??
      { userId: t.assignedToUserId, todo: 0, inProgress: 0, done: 0, total: 0 };
    if (t.status === "Todo") row.todo++;
    else if (t.status === "InProgress") row.inProgress++;
    else if (t.status === "Done") row.done++;
    if (t.status !== "Archived") row.total++;
    map.set(t.assignedToUserId, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, name: nameOf(r.userId) }))
    .sort((a, b) => b.total - a.total);
}
