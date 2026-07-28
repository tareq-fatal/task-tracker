// Pure, testable helpers for per-user performance metrics.

export type PerfTask = {
  createdAt: Date | string;
  completedAt: Date | string | null;
  dueDate: Date | string | null;
  status: string;
};

function toDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local YYYY-MM-DD key for a date. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Count tasks completed within the last `days` days (inclusive of now). */
export function completedInRange(
  tasks: PerfTask[],
  days: number,
  now: Date = new Date()
): number {
  const from = now.getTime() - days * DAY_MS;
  return tasks.filter((t) => {
    if (!t.completedAt) return false;
    const c = toDate(t.completedAt).getTime();
    return c >= from && c <= now.getTime();
  }).length;
}

/** Total completed (status Done with a completedAt). */
export function totalCompleted(tasks: PerfTask[]): number {
  return tasks.filter((t) => t.completedAt).length;
}

/**
 * On-time rate among completed tasks that had a due date.
 * Returns null when no completed task had a due date.
 */
export function onTimeRate(
  tasks: PerfTask[]
): { rate: number; sample: number } | null {
  const sample = tasks.filter((t) => t.completedAt && t.dueDate);
  if (sample.length === 0) return null;
  const onTime = sample.filter(
    (t) => toDate(t.completedAt!).getTime() <= toDate(t.dueDate!).getTime()
  ).length;
  return { rate: Math.round((onTime / sample.length) * 100), sample: sample.length };
}

/** Average completion time (days) for completed tasks; null if none. */
export function avgCompletionDays(tasks: PerfTask[]): number | null {
  const done = tasks.filter((t) => t.completedAt);
  if (done.length === 0) return null;
  const totalDays = done.reduce((sum, t) => {
    const ms = toDate(t.completedAt!).getTime() - toDate(t.createdAt).getTime();
    return sum + Math.max(0, ms) / DAY_MS;
  }, 0);
  return Math.round((totalDays / done.length) * 10) / 10;
}

/** Open tasks (not Done/Archived) whose due date is in the past. */
export function overdueCount(
  tasks: PerfTask[],
  now: Date = new Date()
): number {
  return tasks.filter((t) => {
    if (t.status === "Done" || t.status === "Archived") return false;
    if (!t.dueDate) return false;
    return toDate(t.dueDate).getTime() < now.getTime();
  }).length;
}

/** Completions bucketed per day for the last `days` days (oldest first). */
export function productivityByDay(
  tasks: PerfTask[],
  days: number,
  now: Date = new Date()
): { key: string; label: string; count: number }[] {
  const buckets: { key: string; label: string; count: number }[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = dayKey(d);
    index.set(key, buckets.length);
    buckets.push({ key, label: String(d.getDate()), count: 0 });
  }
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const key = dayKey(toDate(t.completedAt));
    const idx = index.get(key);
    if (idx != null) buckets[idx].count += 1;
  }
  return buckets;
}

/** Top N projects by task count for this user's tasks. */
export function topProjects(
  tasks: { project: { id: string; name: string; color: string } | null }[],
  n: number = 5
): { id: string; name: string; color: string; count: number }[] {
  const map = new Map<
    string,
    { id: string; name: string; color: string; count: number }
  >();
  for (const t of tasks) {
    if (!t.project) continue;
    const cur = map.get(t.project.id);
    if (cur) cur.count += 1;
    else map.set(t.project.id, { ...t.project, count: 1 });
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
