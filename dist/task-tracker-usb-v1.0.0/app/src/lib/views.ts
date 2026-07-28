// Pure layout helpers for Calendar / Gantt / Timeline views. Unit-tested.

const DAY = 24 * 60 * 60 * 1000;

export type MonthCell = { date: string; day: number; inMonth: boolean };

/** A Monday-start month grid (always 6 weeks × 7 = 42 cells) for `year`/`month` (0-11). */
export function monthMatrix(year: number, month: number): MonthCell[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const startDow = (first.getUTCDay() + 6) % 7; // Monday = 0
  const gridStart = new Date(first.getTime() - startDow * DAY);

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getTime() + i * DAY);
    cells.push({
      date: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
    });
  }
  const weeks: MonthCell[][] = [];
  for (let w = 0; w < 6; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));
  return weeks;
}

/** Bar position as % of the [from,to] window (clamped to 0..100). */
export function barPosition(
  start: Date,
  end: Date,
  from: Date,
  to: Date
): { left: number; width: number } | null {
  const span = to.getTime() - from.getTime();
  if (span <= 0) return null;
  const s = Math.max(start.getTime(), from.getTime());
  const e = Math.min(Math.max(end.getTime(), start.getTime() + DAY), to.getTime());
  if (e <= from.getTime() || s >= to.getTime()) return null; // out of window
  const left = ((s - from.getTime()) / span) * 100;
  const width = Math.max(1.2, ((e - s) / span) * 100);
  return { left: Math.round(left * 100) / 100, width: Math.round(width * 100) / 100 };
}

/** Evenly spaced tick marks (month or quarter labels) across [from,to]. */
export function timeTicks(from: Date, to: Date, count: number): { pct: number; label: string }[] {
  const span = to.getTime() - from.getTime();
  if (span <= 0 || count < 2) return [];
  const ticks: { pct: number; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const t = from.getTime() + (span * i) / (count - 1);
    const d = new Date(t);
    ticks.push({
      pct: (i / (count - 1)) * 100,
      label: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`,
    });
  }
  return ticks;
}

/** Today's position as % within [from,to], or null if outside. */
export function todayPct(now: Date, from: Date, to: Date): number | null {
  const span = to.getTime() - from.getTime();
  if (span <= 0) return null;
  if (now < from || now > to) return null;
  return Math.round(((now.getTime() - from.getTime()) / span) * 10000) / 100;
}
