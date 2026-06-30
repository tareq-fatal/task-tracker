// Roadmap view helpers: quarter axis + per-lane (Epic) date ranges. Pure + tested.

export type QuarterTick = { label: string; xPct: number };

function quarterStart(d: Date): Date {
  const q = Math.floor(d.getMonth() / 3);
  return new Date(d.getFullYear(), q * 3, 1);
}

/** Quarter gridlines across [from, to], as x-percentages (0–100). */
export function quarterTicks(fromMs: number, toMs: number): QuarterTick[] {
  if (toMs <= fromMs) return [];
  const span = toMs - fromMs;
  const ticks: QuarterTick[] = [];
  const cur = quarterStart(new Date(fromMs));
  // step quarter by quarter until past `to`
  for (let i = 0; i < 40; i++) {
    const t = cur.getTime();
    if (t > toMs) break;
    if (t >= fromMs) {
      ticks.push({ label: `Q${Math.floor(cur.getMonth() / 3) + 1} ${cur.getFullYear()}`, xPct: ((t - fromMs) / span) * 100 });
    }
    cur.setMonth(cur.getMonth() + 3);
  }
  return ticks;
}

/** A lane's bar position (left/width %) within [from, to], clamped to the window. */
export function barPct(startMs: number, endMs: number, fromMs: number, toMs: number): { leftPct: number; widthPct: number } {
  const span = toMs - fromMs || 1;
  const s = Math.max(fromMs, Math.min(startMs, toMs));
  const e = Math.max(fromMs, Math.min(endMs, toMs));
  const leftPct = ((s - fromMs) / span) * 100;
  const widthPct = Math.max(1.5, ((e - s) / span) * 100);
  return { leftPct, widthPct };
}

/** Earliest start / latest end across a lane's tasks (ms). Falls back to now. */
export function laneRange(tasks: { createdAt: string; dueDate: string | null }[], nowMs: number): { start: number; end: number } {
  if (tasks.length === 0) return { start: nowMs, end: nowMs };
  let start = Infinity;
  let end = -Infinity;
  for (const t of tasks) {
    const c = Date.parse(t.createdAt);
    const d = t.dueDate ? Date.parse(t.dueDate) : c;
    if (c < start) start = c;
    if (d > end) end = d;
  }
  if (end < start) end = start;
  return { start, end };
}

export function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}
