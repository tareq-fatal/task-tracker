import { describe, expect, it } from "vitest";
import {
  BREAK_MINUTES,
  FOCUS_MINUTES,
  formatCountdown,
  isPomodoroState,
  nextPhase,
  remainingSeconds,
  startPomodoro,
} from "./pomodoro";

const T0 = 1_750_000_000_000;

describe("pomodoro cycle", () => {
  it("starts with a 25-minute focus phase", () => {
    const s = startPomodoro("task1", T0);
    expect(s.phase).toBe("focus");
    expect(s.cycle).toBe(1);
    expect(s.phaseEndsAt).toBe(T0 + FOCUS_MINUTES * 60_000);
  });

  it("alternates focus → break → focus and counts cycles", () => {
    const focus1 = startPomodoro("task1", T0);
    const break1 = nextPhase(focus1);
    expect(break1.phase).toBe("break");
    expect(break1.cycle).toBe(1);
    expect(break1.phaseEndsAt).toBe(focus1.phaseEndsAt + BREAK_MINUTES * 60_000);

    const focus2 = nextPhase(break1);
    expect(focus2.phase).toBe("focus");
    expect(focus2.cycle).toBe(2);
    expect(focus2.phaseEndsAt).toBe(break1.phaseEndsAt + FOCUS_MINUTES * 60_000);
  });

  it("computes remaining seconds, clamped at 0", () => {
    const s = startPomodoro("task1", T0);
    expect(remainingSeconds(s, T0)).toBe(FOCUS_MINUTES * 60);
    expect(remainingSeconds(s, T0 + 60_000)).toBe((FOCUS_MINUTES - 1) * 60);
    expect(remainingSeconds(s, s.phaseEndsAt + 5_000)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("renders m:ss", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(59)).toBe("0:59");
    expect(formatCountdown(1499)).toBe("24:59");
  });
});

describe("isPomodoroState", () => {
  it("accepts a valid state and rejects junk", () => {
    expect(isPomodoroState(startPomodoro("t", T0))).toBe(true);
    expect(isPomodoroState(null)).toBe(false);
    expect(isPomodoroState({ taskId: 1 })).toBe(false);
    expect(isPomodoroState({ taskId: "t", phase: "nap", phaseEndsAt: 1, cycle: 1 })).toBe(false);
  });
});
