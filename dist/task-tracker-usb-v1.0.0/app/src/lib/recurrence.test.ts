import { describe, it, expect } from "vitest";
import {
  parseRule,
  presetToRule,
  describeRule,
  nextOccurrence,
  buildRule,
  ruleWeekdays,
  ruleInterval,
} from "./recurrence";

describe("buildRule / ruleWeekdays / ruleInterval", () => {
  it("builds presets with interval and weekdays", () => {
    expect(buildRule("none")).toBeNull();
    expect(buildRule("daily")).toBe("FREQ=DAILY");
    expect(buildRule("daily", 3)).toBe("FREQ=DAILY;INTERVAL=3");
    expect(buildRule("weekly", 2, ["MO", "WE"])).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE");
    // weekdays only apply to weekly and are normalised to canonical order
    expect(buildRule("weekly", 1, ["FR", "MO"])).toBe("FREQ=WEEKLY;BYDAY=MO,FR");
    expect(buildRule("monthly", 1, ["MO"])).toBe("FREQ=MONTHLY");
  });

  it("clamps interval to >= 1", () => {
    expect(buildRule("daily", 0)).toBe("FREQ=DAILY");
    expect(buildRule("daily", -5)).toBe("FREQ=DAILY");
  });

  it("reads weekdays and interval back out of a rule", () => {
    expect(ruleWeekdays("FREQ=WEEKLY;BYDAY=WE,MO")).toEqual(["MO", "WE"]);
    expect(ruleWeekdays("FREQ=DAILY")).toEqual([]);
    expect(ruleInterval("FREQ=WEEKLY;INTERVAL=4")).toBe(4);
    expect(ruleInterval(null)).toBe(1);
  });
});

describe("parseRule / presetToRule / describeRule", () => {
  it("maps presets to rules and back", () => {
    expect(presetToRule("daily")).toBe("FREQ=DAILY");
    expect(presetToRule("weekly")).toBe("FREQ=WEEKLY");
    expect(presetToRule("monthly")).toBe("FREQ=MONTHLY");
    expect(presetToRule("none")).toBeNull();
    expect(describeRule("FREQ=WEEKLY;BYDAY=MO,WE")).toBe("weekly");
    expect(describeRule(null)).toBe("none");
  });
  it("parses interval and byday", () => {
    const p = parseRule("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR");
    expect(p.freq).toBe("WEEKLY");
    expect(p.interval).toBe(2);
    expect(p.byday).toEqual([1, 5]);
  });
});

describe("nextOccurrence", () => {
  const wed = new Date("2026-06-24T09:00:00Z"); // Wednesday

  it("returns null for empty/invalid", () => {
    expect(nextOccurrence(null, wed)).toBeNull();
    expect(nextOccurrence("BYDAY=MO", wed)).toBeNull(); // no FREQ
  });

  it("DAILY honors interval and keeps time", () => {
    expect(nextOccurrence("FREQ=DAILY", wed)?.toISOString()).toBe("2026-06-25T09:00:00.000Z");
    expect(nextOccurrence("FREQ=DAILY;INTERVAL=3", wed)?.toISOString()).toBe("2026-06-27T09:00:00.000Z");
  });

  it("WEEKLY without BYDAY adds interval weeks", () => {
    expect(nextOccurrence("FREQ=WEEKLY", wed)?.toISOString()).toBe("2026-07-01T09:00:00.000Z");
    expect(nextOccurrence("FREQ=WEEKLY;INTERVAL=2", wed)?.toISOString()).toBe("2026-07-08T09:00:00.000Z");
  });

  it("WEEKLY with BYDAY finds the next listed weekday", () => {
    // from Wed → next of {Mon,Fri} is Fri 2026-06-26
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO,FR", wed)?.toISOString()).toBe("2026-06-26T09:00:00.000Z");
    // from Wed → next Mon is 2026-06-29
    expect(nextOccurrence("FREQ=WEEKLY;BYDAY=MO", wed)?.toISOString()).toBe("2026-06-29T09:00:00.000Z");
  });

  it("MONTHLY adds months and clamps end-of-month", () => {
    expect(nextOccurrence("FREQ=MONTHLY", wed)?.toISOString()).toBe("2026-07-24T09:00:00.000Z");
    const jan31 = new Date("2026-01-31T09:00:00Z");
    // Feb has 28 days in 2026 → clamp to Feb 28
    expect(nextOccurrence("FREQ=MONTHLY", jan31)?.toISOString()).toBe("2026-02-28T09:00:00.000Z");
  });
});
