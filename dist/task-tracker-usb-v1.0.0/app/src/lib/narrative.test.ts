import { describe, it, expect } from "vitest";
import { bestWeekday, activeStreak, buildNarrative, type NarrativeInput } from "./narrative";

describe("bestWeekday", () => {
  it("returns the weekday with most completions", () => {
    // three Tuesdays (2026-06-30, 07-07 are Tue), one Monday
    const dates = [new Date("2026-06-30"), new Date("2026-07-07"), new Date("2026-06-23"), new Date("2026-06-29")];
    expect(bestWeekday(dates)).toBe(new Date("2026-06-30").getDay()); // Tuesday
  });
  it("null when empty", () => {
    expect(bestWeekday([])).toBeNull();
  });
});

describe("activeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(activeStreak(["2026-07-02", "2026-07-03", "2026-07-04"], "2026-07-04")).toBe(3);
  });
  it("grace: counts up to yesterday if today not active", () => {
    expect(activeStreak(["2026-07-02", "2026-07-03"], "2026-07-04")).toBe(2);
  });
  it("stops at a gap", () => {
    expect(activeStreak(["2026-06-30", "2026-07-03", "2026-07-04"], "2026-07-04")).toBe(2);
  });
  it("0 when neither today nor yesterday active", () => {
    expect(activeStreak(["2026-06-01"], "2026-07-04")).toBe(0);
  });
});

describe("buildNarrative", () => {
  const base: NarrativeInput = { trendDeltaPct: 0, trendUp: true, bestWeekday: null, streakDays: 0, forecastDeltaDays: null, overdue: 0, topOverduePriority: "High" };
  it("emits only applicable insights, in order", () => {
    const n = buildNarrative({ ...base, streakDays: 12, bestWeekday: 2, trendDeltaPct: 30, trendUp: true, forecastDeltaDays: -2, overdue: 3 });
    expect(n.map((x) => x.kind)).toEqual(["streak", "bestDay", "trend", "forecast", "recommend"]);
    expect(n[0]).toMatchObject({ icon: "💥", days: 12 });
    expect(n[2]).toMatchObject({ icon: "🚀", deltaPct: 30, up: true });
    expect(n[3]).toMatchObject({ icon: "📈", deltaDays: 2, early: true });
  });
  it("skips streak < 2, zero trend, null forecast, no overdue", () => {
    expect(buildNarrative({ ...base, streakDays: 1 })).toEqual([]);
  });
  it("declining trend uses 📉", () => {
    const n = buildNarrative({ ...base, trendDeltaPct: -15, trendUp: false });
    expect(n[0]).toMatchObject({ kind: "trend", icon: "📉", deltaPct: 15, up: false });
  });
  it("late forecast is not early", () => {
    const n = buildNarrative({ ...base, forecastDeltaDays: 4 });
    expect(n[0]).toMatchObject({ kind: "forecast", early: false, deltaDays: 4 });
  });
});
