// Due-date urgency bucket for the colour-coded card badge. Pure + unit-tested.
export type DueBucket = "overdue" | "today" | "week" | "far";

const DAY = 86400000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function dueBucket(due: Date | string | null | undefined, now: Date): DueBucket | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  const diffDays = Math.round((midnight(d) - midnight(now)) / DAY);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays <= 7) return "week";
  return "far";
}
