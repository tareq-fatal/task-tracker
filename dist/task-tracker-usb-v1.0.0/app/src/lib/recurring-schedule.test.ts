import { describe, it, expect } from "vitest";
import {
  nextFire,
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
