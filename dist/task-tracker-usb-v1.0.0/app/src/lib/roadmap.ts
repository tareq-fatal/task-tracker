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

const DAY_MS = 86400000;
export type Zoom = "3m" | "6m" | "1y" | "3y" | "auto";
export const ZOOMS: Zoom[] = ["3m", "6m", "1y", "3y", "auto"];
const ZOOM_DAYS: Record<Exclude<Zoom, "auto">, number> = { "3m": 90, "6m": 180, "1y": 365, "3y": 1095 };

/**
 * The visible time window. "auto" fits the lanes but CAPS the span at ~3 years —
 * so a single stray old/far date (e.g. an imported 2020 task) can't stretch the
 * axis to 8 years; instead it focuses ~6mo past → ~18mo ahead of today. Presets
 * center on now, roadmap-biased (¼ past, ¾ future).
 */
export function roadmapWindow(lanes: { start: number; end: number }[], now: number, zoom: Zoom): { from: number; to: number } {
  if (zoom !== "auto") {
    const span = ZOOM_DAYS[zoom] * DAY_MS;
    return { from: now - span * 0.25, to: now + span * 0.75 };
  }
  if (lanes.length === 0) return { from: now - 30 * DAY_MS, to: now + 90 * DAY_MS };
  const dataFrom = Math.min(...lanes.map((l) => l.start));
  const dataTo = Math.max(...lanes.map((l) => l.end));
  const CAP = 3 * 365 * DAY_MS;
  if (dataTo - dataFrom <= CAP) return { from: dataFrom - 14 * DAY_MS, to: dataTo + 14 * DAY_MS };
  return { from: now - 180 * DAY_MS, to: now + 545 * DAY_MS };
}
