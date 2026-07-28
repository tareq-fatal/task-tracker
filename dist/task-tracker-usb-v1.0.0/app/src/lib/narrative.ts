// Algorithm-based "AI insights" — narrative descriptors from aggregated data.
// No LLM: deterministic + fully unit-tested. The UI localizes each descriptor.

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Weekday (0=Sun..6=Sat) with the most completions, or null if no data. */
export function bestWeekday(dates: Date[]): number | null {
  if (dates.length === 0) return null;
  const counts = new Array(7).fill(0);
  for (const d of dates) counts[d.getDay()]++;
  let best = 0;
  for (let i = 1; i < 7; i++) if (counts[i] > counts[best]) best = i;
  return counts[best] > 0 ? best : null;
}

/** Consecutive active days ending today (or yesterday as grace). */
export function activeStreak(activeDates: string[], today: string): number {
  const set = new Set(activeDates);
  const todayMs = Date.parse(today + "T00:00:00Z"); // UTC to match iso()
  let start: number;
  if (set.has(today)) start = todayMs;
  else if (set.has(iso(new Date(todayMs - DAY)))) start = todayMs - DAY;
  else return 0;
  let streak = 0;
  for (let ms = start; set.has(iso(new Date(ms))); ms -= DAY) streak++;
  return streak;
}

export type Narrative =
  | { kind: "streak"; icon: "💥"; days: number }
  | { kind: "bestDay"; icon: "🏆"; weekday: number }
  | { kind: "trend"; icon: "🚀" | "📉"; deltaPct: number; up: boolean }
  | { kind: "forecast"; icon: "📈"; deltaDays: number; early: boolean }
  | { kind: "recommend"; icon: "💡"; overdue: number; priority: string };

export type NarrativeInput = {
  trendDeltaPct: number;
  trendUp: boolean;
  bestWeekday: number | null;
  streakDays: number;
  forecastDeltaDays: number | null; // null = no active sprint / stalled
  overdue: number;
  topOverduePriority: string; // "High" etc.
};

/** Ordered, filtered narrative insights (skips ones that don't apply). */
export function buildNarrative(i: NarrativeInput): Narrative[] {
  const out: Narrative[] = [];
  if (i.streakDays >= 2) out.push({ kind: "streak", icon: "💥", days: i.streakDays });
  if (i.bestWeekday !== null) out.push({ kind: "bestDay", icon: "🏆", weekday: i.bestWeekday });
  if (i.trendDeltaPct !== 0) out.push({ kind: "trend", icon: i.trendUp ? "🚀" : "📉", deltaPct: Math.abs(i.trendDeltaPct), up: i.trendUp });
  if (i.forecastDeltaDays !== null && i.forecastDeltaDays !== 0)
    out.push({ kind: "forecast", icon: "📈", deltaDays: Math.abs(i.forecastDeltaDays), early: i.forecastDeltaDays < 0 });
  if (i.overdue > 0) out.push({ kind: "recommend", icon: "💡", overdue: i.overdue, priority: i.topOverduePriority });
  return out;
}
