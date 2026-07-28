// Gantt-chart pure helpers: day/week/month time scale, bar geometry, schedule
// derivation, and Critical-Path Method (CPM). No React, no DOM — fully unit-tested
// (see gantt.test.ts). All date math is UTC-day based so it is timezone-stable.

export const DAY_MS = 86_400_000;

export type ZoomLevel = "day" | "week" | "month";
export const ZOOM_LEVELS: ZoomLevel[] = ["day", "week", "month"];

/** Horizontal density: pixels per calendar day at each zoom level. */
export const PX_PER_DAY: Record<ZoomLevel, number> = {
  day: 40,
  week: 14,
  month: 4.2,
};

/** UTC midnight of the day containing `ms`. */
export function startOfDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

export function addDays(ms: number, days: number): number {
  return ms + days * DAY_MS;
}

/** Whole-day difference b - a (can be negative). */
export function diffDays(aMs: number, bMs: number): number {
  return Math.round((bMs - aMs) / DAY_MS);
}

export type RawTask = {
  startDate: string | null; // iso or null
  dueDate: string | null; // iso or null
  createdAt: string; // iso
  estimatedHours?: number | null;
};

export type Schedule = { start: number; end: number };

/**
 * Derive a concrete [start, end] bar for a task. `startDate` is the planned Gantt
 * start; when absent we fall back to `createdAt`. `end` is the due date; when
 * absent we estimate from `estimatedHours` (8h = 1 working day) or default to a
 * one-day bar. The bar is always ≥ 1 day so it stays grab-able.
 */
export function resolveSchedule(t: RawTask): Schedule {
  const created = Date.parse(t.createdAt);
  const start = startOfDay(t.startDate ? Date.parse(t.startDate) : created);
  let end: number;
  if (t.dueDate) {
    end = startOfDay(Date.parse(t.dueDate));
  } else {
    const days = t.estimatedHours && t.estimatedHours > 0 ? Math.ceil(t.estimatedHours / 8) : 1;
    end = addDays(start, Math.max(1, days));
  }
  if (end < start + DAY_MS) end = start + DAY_MS; // enforce ≥ 1 day
  return { start, end };
}

/**
 * Visible window [from, to] snapped to day boundaries with `pad` days on each
 * side. Falls back to a sensible range around `now` when there are no tasks.
 */
export function ganttWindow(
  schedules: Schedule[],
  now: number,
  pad = 3
): { from: number; to: number } {
  if (schedules.length === 0) {
    return { from: startOfDay(addDays(now, -7)), to: startOfDay(addDays(now, 30)) };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const s of schedules) {
    if (s.start < min) min = s.start;
    if (s.end > max) max = s.end;
  }
  // Always include "today" in the window so the marker is visible.
  min = Math.min(min, startOfDay(now));
  max = Math.max(max, startOfDay(now) + DAY_MS);
  return { from: startOfDay(addDays(min, -pad)), to: startOfDay(addDays(max, pad)) };
}

/** X-offset (px) of a day within the window. */
export function xForMs(ms: number, fromMs: number, pxPerDay: number): number {
  return (diffDays(fromMs, ms) + (ms - startOfDay(ms)) / DAY_MS) * pxPerDay;
}

/** Snap a pixel offset back to a UTC-day timestamp. */
export function msForX(px: number, fromMs: number, pxPerDay: number): number {
  return startOfDay(addDays(fromMs, Math.round(px / pxPerDay)));
}

/** Total timeline width in px for the window at a given zoom. */
export function trackWidth(fromMs: number, toMs: number, pxPerDay: number): number {
  return Math.max(0, diffDays(fromMs, toMs)) * pxPerDay;
}

/** A bar's pixel geometry within the window. */
export function barGeometry(
  s: Schedule,
  fromMs: number,
  pxPerDay: number
): { x: number; width: number } {
  const x = xForMs(s.start, fromMs, pxPerDay);
  const width = Math.max(pxPerDay * 0.6, (diffDays(s.start, s.end)) * pxPerDay);
  return { x, width };
}

export type AxisTick = { x: number; label: string; major: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Time-axis ticks across [from, to] for the given zoom.
 *  - day:   one tick per day; major on month's first day.
 *  - week:  one tick per Monday; major on the Monday starting a month.
 *  - month: one tick per month start; all major.
 */
export function axisTicks(fromMs: number, toMs: number, zoom: ZoomLevel, pxPerDay: number): AxisTick[] {
  if (toMs <= fromMs) return [];
  const ticks: AxisTick[] = [];
  const from = startOfDay(fromMs);
  if (zoom === "day") {
    for (let t = from; t <= toMs; t = addDays(t, 1)) {
      const d = new Date(t);
      const first = d.getUTCDate() === 1;
      ticks.push({
        x: xForMs(t, from, pxPerDay),
        label: first ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : String(d.getUTCDate()),
        major: first,
      });
    }
  } else if (zoom === "week") {
    // advance to the first Monday ≥ from
    let t = from;
    const dow = (new Date(t).getUTCDay() + 6) % 7; // Mon = 0
    if (dow !== 0) t = addDays(t, 7 - dow);
    for (; t <= toMs; t = addDays(t, 7)) {
      const d = new Date(t);
      const major = d.getUTCDate() <= 7; // Monday that opens a month
      ticks.push({
        x: xForMs(t, from, pxPerDay),
        label: major ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : `${d.getUTCDate()}`,
        major,
      });
    }
  } else {
    // month
    const d0 = new Date(from);
    let y = d0.getUTCFullYear();
    let m = d0.getUTCMonth();
    if (d0.getUTCDate() !== 1) {
      m += 1;
      if (m > 11) { m = 0; y += 1; }
    }
    for (let t = Date.UTC(y, m, 1); t <= toMs; ) {
      const d = new Date(t);
      ticks.push({
        x: xForMs(t, from, pxPerDay),
        label: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
        major: true,
      });
      m += 1;
      if (m > 11) { m = 0; y += 1; }
      t = Date.UTC(y, m, 1);
    }
  }
  return ticks;
}

// ─────────────────────────────── Critical Path (CPM) ───────────────────────────

export type CpmTask = { id: string; start: number; end: number };
/** `taskId` depends on `dependsOnId` (dependsOnId must finish first). */
export type CpmDep = { taskId: string; dependsOnId: string };

export type CpmResult = {
  critical: Set<string>; // task ids on a critical (zero-slack) path
  criticalEdges: Set<string>; // `${dependsOnId}->${taskId}` edges on the path
  finish: number; // minimum project duration in days
};

/**
 * Critical-Path Method over the dependency DAG. Durations come from each task's
 * scheduled [start, end] length (min 1 day). Returns the zero-slack tasks and the
 * edges linking them. Cycles are tolerated: nodes not reachable in a topological
 * order are simply treated as non-critical rather than throwing.
 */
export function criticalPath(tasks: CpmTask[], deps: CpmDep[]): CpmResult {
  const ids = new Set(tasks.map((t) => t.id));
  const dur = new Map<string, number>();
  for (const t of tasks) dur.set(t.id, Math.max(1, diffDays(t.start, t.end)));

  // Adjacency: preds[x] = tasks x depends on; succ[x] = tasks depending on x.
  const preds = new Map<string, string[]>();
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of ids) { preds.set(id, []); succ.set(id, []); indeg.set(id, 0); }
  const edges = deps.filter((d) => ids.has(d.taskId) && ids.has(d.dependsOnId) && d.taskId !== d.dependsOnId);
  const seen = new Set<string>();
  for (const d of edges) {
    const key = `${d.dependsOnId}->${d.taskId}`;
    if (seen.has(key)) continue; // dedupe parallel edges
    seen.add(key);
    preds.get(d.taskId)!.push(d.dependsOnId);
    succ.get(d.dependsOnId)!.push(d.taskId);
    indeg.set(d.taskId, indeg.get(d.taskId)! + 1);
  }

  // Kahn topological order.
  const order: string[] = [];
  const queue: string[] = [];
  for (const id of ids) if (indeg.get(id) === 0) queue.push(id);
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const s of succ.get(n)!) {
      indeg.set(s, indeg.get(s)! - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  const acyclic = order.length === ids.size;

  // Forward pass: earliest finish.
  const ef = new Map<string, number>();
  const es = new Map<string, number>();
  for (const id of order) {
    let earliestStart = 0;
    for (const p of preds.get(id)!) earliestStart = Math.max(earliestStart, ef.get(p) ?? 0);
    es.set(id, earliestStart);
    ef.set(id, earliestStart + dur.get(id)!);
  }
  const finish = order.length ? Math.max(...order.map((id) => ef.get(id) ?? 0)) : 0;

  // Backward pass: latest finish.
  const lf = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const outs = succ.get(id)!;
    let latestFinish = finish;
    if (outs.length) latestFinish = Math.min(...outs.map((s) => (lf.get(s) ?? finish) - dur.get(s)!));
    lf.set(id, latestFinish);
  }

  const critical = new Set<string>();
  if (acyclic) {
    for (const id of order) {
      const slack = (lf.get(id) ?? 0) - (ef.get(id) ?? 0);
      if (slack <= 0) critical.add(id);
    }
  }
  // A critical edge connects two critical tasks with no slack between them.
  const criticalEdges = new Set<string>();
  for (const d of edges) {
    if (critical.has(d.taskId) && critical.has(d.dependsOnId)) {
      if ((ef.get(d.dependsOnId) ?? 0) === (es.get(d.taskId) ?? 0)) {
        criticalEdges.add(`${d.dependsOnId}->${d.taskId}`);
      }
    }
  }
  return { critical, criticalEdges, finish };
}
