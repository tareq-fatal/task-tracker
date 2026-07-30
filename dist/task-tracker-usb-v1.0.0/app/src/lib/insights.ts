// Predictive analytics — pure, unit-tested. Powers the "Insights" panel:
// completion forecast, burnout risk, bottleneck detection, effort-vs-reality,
// and period-over-period trend (comparison mode).

export type Direction = "up" | "down" | "flat";

/** Period-over-period change. Trend direction is neutral about good/bad. */
export function trend(current: number, previous: number): { deltaPct: number; direction: Direction } {
  if (previous === 0) {
    if (current === 0) return { deltaPct: 0, direction: "flat" };
    return { deltaPct: 100, direction: "up" };
  }
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  return { deltaPct, direction: deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat" };
}

/** Days until completion given remaining points + a per-day velocity. Null when
 *  velocity is zero (can't finish → "stalled"). */
export function velocityForecast(remainingPoints: number, pointsPerDay: number): number | null {
  if (remainingPoints <= 0) return 0;
  if (pointsPerDay <= 0) return null;
  return Math.ceil(remainingPoints / pointsPerDay);
}

/** Predicted finish vs a planned end date → delta in days (+ = late, - = early). */
export function forecastDelta(daysLeft: number | null, now: Date, plannedEnd: Date | null): number | null {
  if (daysLeft === null || !plannedEnd) return null;
  const DAY = 86400000;
  const predicted = now.getTime() + daysLeft * DAY;
  return Math.round((predicted - plannedEnd.getTime()) / DAY);
}

export type BurnoutInput = { userId: string; name: string; open: number; overdue: number };
export type BurnoutRisk = "high" | "medium" | "none";

/** Flag over-loaded people. High = lots of open work AND overdue items. */
export function burnoutRisk(u: BurnoutInput, opts: { openHigh?: number; overdueHigh?: number } = {}): BurnoutRisk {
  const openHigh = opts.openHigh ?? 8;
  const overdueHigh = opts.overdueHigh ?? 3;
  if (u.overdue >= overdueHigh && u.open >= openHigh) return "high";
  if (u.overdue >= overdueHigh || u.open >= openHigh) return "medium";
  return "none";
}

export type StatusDwell = { status: string; avgAgeDays: number; count: number };

/** The non-terminal status where work sits longest (the bottleneck). Ignores
 *  empty columns. Returns null if there's nothing in progress. */
export function rankBottleneck(dwell: StatusDwell[]): StatusDwell | null {
  const active = dwell.filter((d) => d.count > 0 && d.status !== "Done" && d.status !== "Archived");
  if (active.length === 0) return null;
  return active.reduce((worst, d) => (d.avgAgeDays > worst.avgAgeDays ? d : worst));
}

/** Estimation accuracy: hours actually spent per story point, over tasks that
 *  have both. `ratio` vs a 1pt≈4h baseline: >1 = under-estimated. */
export function effortVsReality(
  tasks: { storyPoints: number | null; spentHours: number }[],
  hoursPerPointBaseline = 4
): { hoursPerPoint: number; ratio: number; sampleSize: number } | null {
  const usable = tasks.filter((t) => (t.storyPoints ?? 0) > 0 && t.spentHours > 0);
  if (usable.length === 0) return null;
  const points = usable.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
  const hours = usable.reduce((s, t) => s + t.spentHours, 0);
  const hoursPerPoint = hours / points;
  return {
    hoursPerPoint: Math.round(hoursPerPoint * 10) / 10,
    ratio: Math.round((hoursPerPoint / hoursPerPointBaseline) * 100) / 100,
    sampleSize: usable.length,
  };
}
