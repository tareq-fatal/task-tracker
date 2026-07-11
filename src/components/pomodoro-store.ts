// Client-side pomodoro persistence + browser notifications (no JSX).
// State lives in localStorage so it survives navigation; the header
// RunningTimer is the single component that drives phase transitions.

import { isPomodoroState, type PomodoroState } from "@/lib/pomodoro";

const KEY = "tt:pomodoro";
/** Broadcast whenever the stored pomodoro state changes. */
export const POMODORO_EVENT = "tt:pomodoro";

export function loadPomodoro(): PomodoroState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPomodoroState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePomodoro(state: PomodoroState | null): void {
  try {
    if (state) window.localStorage.setItem(KEY, JSON.stringify(state));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable (private mode) — pomodoro just won't survive reloads
  }
  window.dispatchEvent(new Event(POMODORO_EVENT));
}

export function requestNotifyPermission(): void {
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

export function notifyBrowser(title: string, body?: string): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    }
  } catch {
    // e.g. Android WebView without Notification constructor — toast covers it
  }
}
