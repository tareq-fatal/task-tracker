// Pure aggregations for the infographic reports. No I/O; unit-tested.

const DAY = 24 * 60 * 60 * 1000;

export type HeatCell = { date: string; count: number };

/** GitHub-style daily counts across [from, to] inclusive (UTC days). */
export function buildHeatmap(events: Date[], from: Date, to: Date): HeatCell[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const counts = new Map<string, number>();
  for (const e of events) {
    const key = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()))
      .toISOString()
      .slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: HeatCell[] = [];
  for (let d = start; d <= end; d += DAY) {
    const key = new Date(d).toISOString().slice(0, 10);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

/** Bucket level 0-4 for a count given the max (for heatmap coloring). */
export function heatLevel(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (max <= 0) return 0;
  const r = count / max;
  if (r > 0.75) return 4;
  if (r > 0.5) return 3;
  if (r > 0.25) return 2;
  return 1;
}

export type Slice = { name: string; value: number };

export function distribution<T extends string>(
  items: { [k: string]: unknown }[],
  key: string,
  order: readonly T[]
): Slice[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const v = String(it[key] ?? "");
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return order
    .map((name) => ({ name, value: counts.get(name) ?? 0 }))
    .filter((s) => s.value > 0);
}

/** A 0-100 productivity score blending on-time %, completion %, and activity. */
export function productivityScore(opts: {
  total: number;
  done: number;
  onTime: number; // completed on or before due
  withDue: number; // completed that had a due date
  activeDays: number; // days with >=1 completion in the window
  windowDays: number;
}): number {
  const completion = opts.total > 0 ? opts.done / opts.total : 0;
  const onTimeRate = opts.withDue > 0 ? opts.onTime / opts.withDue : 1;
  const activity = opts.windowDays > 0 ? Math.min(1, opts.activeDays / Math.min(opts.windowDays, 20)) : 0;
  return Math.round((completion * 40 + onTimeRate * 40 + activity * 20));
}

export function topProjects(
  tasks: { projectName: string | null }[],
  limit = 5
): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!t.projectName) continue;
    counts.set(t.projectName, (counts.get(t.projectName) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Estimate days to finish the remaining open tasks from the recent completion rate. */
export function completionPrediction(
  total: number,
  done: number,
  completedInWindow: number,
  windowDays: number
): { remaining: number; perDay: number; daysLeft: number | null } {
  const remaining = Math.max(0, total - done);
  const perDay = windowDays > 0 ? completedInWindow / windowDays : 0;
  const daysLeft = perDay > 0 ? Math.ceil(remaining / perDay) : null;
  return { remaining, perDay: Math.round(perDay * 10) / 10, daysLeft };
}

export function currentStreak(cells: HeatCell[]): number {
  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].count > 0) streak++;
    else break;
  }
  return streak;
}
