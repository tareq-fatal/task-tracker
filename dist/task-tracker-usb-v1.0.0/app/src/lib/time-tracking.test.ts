import { describe, it, expect } from "vitest";
import {
  elapsedMinutes,
  formatMinutes,
  totalMinutes,
  parseDurationToMinutes,
} from "./time-tracking";

describe("elapsedMinutes / formatMinutes", () => {
  it("floors elapsed minutes, never negative", () => {
    const a = new Date("2026-06-01T10:00:00Z");
    expect(elapsedMinutes(a, new Date("2026-06-01T11:30:40Z"))).toBe(90);
    expect(elapsedMinutes(a, new Date("2026-06-01T09:00:00Z"))).toBe(0);
  });
  it("formats h/m", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(0)).toBe("0m");
  });
});

describe("totalMinutes", () => {
  const now = new Date("2026-06-01T12:00:00Z");
  it("sums completed + live-elapsed running entries", () => {
    const entries = [
      { minutes: 30, startedAt: new Date("2026-06-01T08:00:00Z"), endedAt: new Date("2026-06-01T08:30:00Z") },
      { minutes: 0, startedAt: new Date("2026-06-01T11:00:00Z"), endedAt: null }, // running 60m
    ];
    expect(totalMinutes(entries, now)).toBe(90);
  });
});

describe("parseDurationToMinutes", () => {
  it("parses bare minutes, h/m combos, decimals", () => {
    expect(parseDurationToMinutes("90")).toBe(90);
    expect(parseDurationToMinutes("1h30m")).toBe(90);
    expect(parseDurationToMinutes("1h30")).toBe(90);
    expect(parseDurationToMinutes("2h")).toBe(120);
    expect(parseDurationToMinutes("1.5h")).toBe(90);
    expect(parseDurationToMinutes("45m")).toBe(45);
  });
  it("rejects garbage", () => {
    expect(parseDurationToMinutes("abc")).toBeNull();
    expect(parseDurationToMinutes("")).toBeNull();
  });
});
