import { describe, it, expect } from "vitest";
import {
  nextFire,
  nextFireAfter,
  reachedEndCount,
  pastUntil,
  decideDue,
  type SeriesSchedule,
} from "./recurring-schedule";

const base: SeriesSchedule = {
  rule: null,
  cron: null,
  tz: null,
  until: null,
  endCount: null,
  count: 0,
  paused: false,
};

describe("nextFire", () => {
  it("uses the rule when no cron is set", () => {
    const from = new Date("2026-06-24T09:00:00Z"); // Wed
    expect(nextFire({ rule: "FREQ=DAILY", cron: null, tz: null }, from)?.toISOString()).toBe(
      "2026-06-25T09:00:00.000Z"
    );
  });

  it("prefers cron over rule when both are present", () => {
    const from = new Date("2026-07-01T06:00:00Z");
    const next = nextFire({ rule: "FREQ=DAILY", cron: "0 9 * * *", tz: "UTC" }, from);
    expect(next?.toISOString()).toBe("2026-07-01T09:00:00.000Z");
  });
});

describe("end-condition predicates", () => {
  it("reachedEndCount", () => {
    expect(reachedEndCount(3, null)).toBe(false);
    expect(reachedEndCount(2, 3)).toBe(false);
    expect(reachedEndCount(3, 3)).toBe(true);
    expect(reachedEndCount(4, 3)).toBe(true);
  });

  it("pastUntil", () => {
    const until = new Date("2026-07-10T00:00:00Z");
    expect(pastUntil(null, until)).toBe(false);
    expect(pastUntil(new Date("2026-07-09T00:00:00Z"), until)).toBe(false);
    expect(pastUntil(new Date("2026-07-11T00:00:00Z"), until)).toBe(true);
    expect(pastUntil(new Date("2026-07-11T00:00:00Z"), null)).toBe(false);
  });
});

describe("decideDue", () => {
  const dueAt = new Date("2026-06-24T09:00:00Z");

  it("skips a paused series untouched", () => {
    expect(decideDue({ ...base, rule: "FREQ=DAILY", paused: true }, dueAt)).toEqual({
      action: "skip",
    });
  });

  it("spawns and computes the follow-up occurrence", () => {
    const d = decideDue({ ...base, rule: "FREQ=DAILY" }, dueAt);
    expect(d.action).toBe("spawn");
    if (d.action === "spawn") {
      expect(d.next?.toISOString()).toBe("2026-06-25T09:00:00.000Z");
    }
  });

  it("reports finished when the end-count is already reached (no spawn)", () => {
    expect(
      decideDue({ ...base, rule: "FREQ=DAILY", endCount: 3, count: 3 }, dueAt)
    ).toEqual({ action: "finished" });
  });

  it("spawns the LAST instance with a null follow-up at the end-count boundary", () => {
    // count 2, endCount 3 → this spawn is the 3rd; nothing should follow.
    const d = decideDue({ ...base, rule: "FREQ=DAILY", endCount: 3, count: 2 }, dueAt);
    expect(d).toEqual({ action: "spawn", next: null });
  });

  it("stops when the follow-up would fall past the until date", () => {
    const d = decideDue(
      { ...base, rule: "FREQ=DAILY", until: new Date("2026-06-24T23:59:59Z") },
      dueAt
    );
    // spawns today, but tomorrow is past `until` → no follow-up.
    expect(d).toEqual({ action: "spawn", next: null });
  });

  it("is finished if the due time itself is past the until date", () => {
    const d = decideDue(
      { ...base, rule: "FREQ=DAILY", until: new Date("2026-06-23T00:00:00Z") },
      dueAt
    );
    expect(d).toEqual({ action: "finished" });
  });
});

// Kunden-Report 2026-08, Bug 1: a series that fell behind must yield ONE
// spawn with the follow-up past `now` — not one copy per cron run until the
// backlog drains (that duplicated tasks in /list and /admin/tasks).
describe("catch-up collapse", () => {
  const dueAt = new Date("2026-06-01T09:00:00Z");

  it("nextFireAfter skips every missed occurrence but keeps the time-of-day", () => {
    const now = new Date("2026-06-24T14:30:00Z");
    const next = nextFireAfter({ rule: "FREQ=DAILY", cron: null, tz: null }, dueAt, now);
    expect(next?.toISOString()).toBe("2026-06-25T09:00:00.000Z");
  });

  it("nextFireAfter equals nextFire when the series is on time", () => {
    const next = nextFireAfter({ rule: "FREQ=DAILY", cron: null, tz: null }, dueAt, dueAt);
    expect(next?.toISOString()).toBe("2026-06-02T09:00:00.000Z");
  });

  it("decideDue with `now` collapses a 3-week backlog into a single spawn", () => {
    const now = new Date("2026-06-24T14:30:00Z");
    const d = decideDue({ ...base, rule: "FREQ=DAILY" }, dueAt, now);
    expect(d.action).toBe("spawn");
    if (d.action === "spawn") {
      // follow-up is strictly after now → the next cron run spawns nothing.
      expect(d.next!.getTime()).toBeGreaterThan(now.getTime());
      expect(d.next?.toISOString()).toBe("2026-06-25T09:00:00.000Z");
    }
  });

  it("collapse still honours the until date", () => {
    const now = new Date("2026-06-24T14:30:00Z");
    const d = decideDue(
      { ...base, rule: "FREQ=DAILY", until: new Date("2026-06-10T00:00:00Z") },
      dueAt,
      now
    );
    // dueAt itself is before until → spawns, but the collapsed follow-up
    // (after now) is past until → series retires.
    expect(d).toEqual({ action: "spawn", next: null });
  });

  it("weekly BYDAY backlog lands on the next listed weekday after now", () => {
    const now = new Date("2026-06-24T14:30:00Z"); // Wed
    const d = decideDue({ ...base, rule: "FREQ=WEEKLY;BYDAY=MO" }, dueAt, now);
    expect(d.action).toBe("spawn");
    if (d.action === "spawn") {
      expect(d.next?.toISOString()).toBe("2026-06-29T09:00:00.000Z"); // next Monday
    }
  });
});
