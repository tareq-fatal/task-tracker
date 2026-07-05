// Pure pomodoro cycle logic (25 min focus / 5 min break). Unit-tested.
// The client stores the state in localStorage and drives phase changes;
// time entries themselves stay server-side (start/stop per focus phase).

export const FOCUS_MINUTES = 25;
export const BREAK_MINUTES = 5;

/** Auto-pause a running timer after this much time without any user input. */
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export type PomodoroPhase = "focus" | "break";

export type PomodoroState = {
  taskId: string;
  taskTitle?: string; // shown in the header pill during breaks (timer entry is stopped then)
  phase: PomodoroPhase;
  phaseEndsAt: number; // epoch ms
  cycle: number; // 1-based focus cycle
};

export function startPomodoro(taskId: string, now: number, taskTitle?: string): PomodoroState {
  return { taskId, taskTitle, phase: "focus", phaseEndsAt: now + FOCUS_MINUTES * 60_000, cycle: 1 };
}

/** Transition focus → break → next focus. Phases run back-to-back from phaseEndsAt. */
export function nextPhase(s: PomodoroState): PomodoroState {
  if (s.phase === "focus") {
    return { ...s, phase: "break", phaseEndsAt: s.phaseEndsAt + BREAK_MINUTES * 60_000 };
  }
  return { ...s, phase: "focus", phaseEndsAt: s.phaseEndsAt + FOCUS_MINUTES * 60_000, cycle: s.cycle + 1 };
}

export function remainingSeconds(s: PomodoroState, now: number): number {
  return Math.max(0, Math.ceil((s.phaseEndsAt - now) / 1000));
}

/** "24:59" countdown. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function isPomodoroState(v: unknown): v is PomodoroState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.taskId === "string" &&
    (s.phase === "focus" || s.phase === "break") &&
    typeof s.phaseEndsAt === "number" &&
    typeof s.cycle === "number"
  );
}
