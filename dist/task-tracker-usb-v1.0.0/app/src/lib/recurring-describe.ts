// Human-readable, localized description of a recurring series' schedule.
// Pure (no server-only): used by the task-detail page and the admin list.

import { parseRule, WEEKDAYS } from "./recurrence";

export type RecurrenceSummary = {
  recurringRule: string | null;
  recurringCron: string | null;
  recurringTz: string | null;
};

type Dict = Record<string, string>;

/**
 * A compact, translated one-liner for a schedule, e.g.
 *   "Wöchentlich · alle 2 · Mo, Mi"   or   "Cron: 0 9 * * 1-5 · Europe/Berlin".
 * Returns "" when the task doesn't recur.
 */
export function describeSchedule(s: RecurrenceSummary, t: Dict): string {
  if (s.recurringCron) {
    const tz = s.recurringTz ? ` · ${s.recurringTz}` : "";
    return `${t["recurrence.cronLabel"] ?? "Cron"}: ${s.recurringCron}${tz}`;
  }
  if (!s.recurringRule) return "";

  const p = parseRule(s.recurringRule);
  const freqKey =
    p.freq === "DAILY" ? "recurrence.daily" : p.freq === "WEEKLY" ? "recurrence.weekly" : p.freq === "MONTHLY" ? "recurrence.monthly" : null;
  if (!freqKey) return "";

  const parts: string[] = [t[freqKey] ?? freqKey];
  if (p.interval > 1) {
    parts.push(`${t["recurrence.every"] ?? "every"} ${p.interval}`);
  }
  if (p.freq === "WEEKLY" && p.byday.length) {
    const days = WEEKDAYS.filter((_, i) => p.byday.includes(i)).map(
      (code) => t[`recurrence.wd.${code}`] ?? code
    );
    parts.push(days.join(", "));
  }
  return parts.join(" · ");
}
