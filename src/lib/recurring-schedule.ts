// The decision layer for recurring-task series: given a series' schedule +
// end-conditions + progress, compute the next fire time and decide when the
// series is exhausted. Pure and unit-tested; the runner and the server actions
// both drive their behaviour through here so there is a single source of truth.

import { nextOccurrence } from "./recurrence";
import { nextCronOccurrence } from "./cron";

export type SeriesSchedule = {
  rule: string | null; // FREQ=… (preset / weekly). Ignored when cron is set.
  cron: string | null; // 5-field cron, evaluated in tz. Wins over rule.
  tz: string | null; // IANA zone for cron (default UTC).
  until: Date | null; // hard stop: no occurrence on/after this instant.
  endCount: number | null; // hard stop: no more than N spawns total.
  count: number; // spawns already produced.
  paused: boolean;
};

/**
 * The next fire time strictly after `from`, honouring cron-over-rule
 * precedence. Null when neither is set or the schedule can't produce one.
 */
export function nextFire(s: Pick<SeriesSchedule, "rule" | "cron" | "tz">, from: Date): Date | null {
  if (s.cron) return nextCronOccurrence(s.cron, from, s.tz ?? "UTC");
  return nextOccurrence(s.rule, from);
}

/**
 * Like nextFire, but skips every occurrence that already lies in the past:
 * the first fire time strictly after BOTH `from` and `now`. Keeps the series'
 * phase and time-of-day (it walks occurrence by occurrence from `from` instead
 * of re-anchoring at `now`). Bounded — a pathological backlog beyond the guard
 * returns the furthest occurrence reached; the next run continues from there.
 */
export function nextFireAfter(
  s: Pick<SeriesSchedule, "rule" | "cron" | "tz">,
  from: Date,
  now: Date
): Date | null {
  let next = nextFire(s, from);
  for (let guard = 0; next && next.getTime() <= now.getTime() && guard < 1000; guard++) {
    next = nextFire(s, next);
  }
  return next;
}

/** True once the series has spawned its full allotment. */
export function reachedEndCount(count: number, endCount: number | null): boolean {
  return endCount != null && count >= endCount;
}

/** True when `when` falls on/after the series' end date (so it must not fire). */
export function pastUntil(when: Date | null, until: Date | null): boolean {
  if (!when || !until) return false;
  return when.getTime() > until.getTime();
}

export type DueDecision =
  | { action: "skip" } // paused — leave the series untouched
  | { action: "finished" } // exhausted before this fire — clear, spawn nothing
  | { action: "spawn"; next: Date | null }; // fire now; `next` is the follow-up (null → clear after)

/**
 * Decide what to do with a series whose recurringNextAt is due at `dueAt`.
 *  - paused → skip (leave everything as-is).
 *  - already at its end-count, or the due time is past the end date → finished
 *    (no spawn; the caller clears the recurrence).
 *  - otherwise spawn one instance, then compute the follow-up occurrence,
 *    clearing it (next = null) when the end-count or until-date is reached.
 *
 * `now` collapses catch-up: when a series fell behind (cron outage, imported
 * with an old date), the follow-up is the first occurrence after `now` — one
 * spawn total, NOT one per missed occurrence. Kunden-Report 2026-08 Bug 1:
 * the per-run single-step advance spawned another copy of the same task every
 * cron tick until the backlog drained, duplicating it in /list + /admin/tasks.
 */
export function decideDue(s: SeriesSchedule, dueAt: Date, now: Date = dueAt): DueDecision {
  if (s.paused) return { action: "skip" };
  if (reachedEndCount(s.count, s.endCount) || pastUntil(dueAt, s.until)) {
    return { action: "finished" };
  }
  let next = nextFireAfter(s, dueAt, now);
  if (next) {
    const countAfter = s.count + 1;
    if (reachedEndCount(countAfter, s.endCount) || pastUntil(next, s.until)) {
      next = null;
    }
  }
  return { action: "spawn", next };
}
