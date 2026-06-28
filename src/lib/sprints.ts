// Pure sprint analytics — burndown + velocity. No I/O; unit-tested.

const DAY = 24 * 60 * 60 * 1000;

export type SprintTask = { completedAt: Date | null };

export type BurndownPoint = {
  date: string; // yyyy-mm-dd
  remaining: number | null; // null for future days (line stops at today)
  ideal: number;
};

/**
 * Tasks-remaining-per-day across the sprint window, plus an ideal trend line.
 * "Remaining" = tasks not completed by the end of that day. Future days are null
 * so the actual line stops at `now`.
 */
export function sprintBurndown(
  tasks: SprintTask[],
  start: Date,
  end: Date,
  now: Date
): BurndownPoint[] {
  const total = tasks.length;
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  const numDays = Math.max(1, Math.round((endDay - startDay) / DAY) + 1);

  const points: BurndownPoint[] = [];
  for (let i = 0; i < numDays; i++) {
    const dayStart = startDay + i * DAY;
    const dayEnd = new Date(dayStart + DAY - 1);
    const isFuture = dayStart > now.getTime();
    const remaining = isFuture
      ? null
      : tasks.filter((t) => !t.completedAt || t.completedAt > dayEnd).length;
    const ideal =
      numDays === 1 ? 0 : Math.round((total * (1 - i / (numDays - 1))) * 10) / 10;
    points.push({ date: new Date(dayStart).toISOString().slice(0, 10), remaining, ideal });
  }
  return points;
}

export type VelocitySprint = { name: string; tasks: { status: string }[] };

/** Completed vs total task counts per sprint (for a velocity bar chart). */
export function velocity(
  sprints: VelocitySprint[]
): Array<{ name: string; completed: number; total: number }> {
  return sprints.map((s) => ({
    name: s.name,
    completed: s.tasks.filter((t) => t.status === "Done").length,
    total: s.tasks.length,
  }));
}

/** Average completed tasks over the last N sprints (rounded to 1 decimal). */
export function averageVelocity(
  sprints: VelocitySprint[],
  lastN = 5
): number {
  const recent = sprints.slice(-lastN);
  if (recent.length === 0) return 0;
  const sum = recent.reduce(
    (a, s) => a + s.tasks.filter((t) => t.status === "Done").length,
    0
  );
  return Math.round((sum / recent.length) * 10) / 10;
}
