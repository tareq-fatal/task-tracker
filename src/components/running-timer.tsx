"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Coffee, Play, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getRunningEntry,
  startTimerAction,
  stopTimerAction,
  stopTimerAtAction,
  type RunningEntry,
} from "@/actions/time";
import {
  BREAK_MINUTES,
  FOCUS_MINUTES,
  IDLE_TIMEOUT_MS,
  formatCountdown,
  nextPhase,
  remainingSeconds,
  type PomodoroState,
} from "@/lib/pomodoro";
import { POMODORO_EVENT, loadPomodoro, notifyBrowser, savePomodoro } from "@/components/pomodoro-store";
import { useT } from "@/components/i18n-provider";
import { useToast } from "@/components/toast";

function clock(startedAtIso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startedAtIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// A pomodoro phase this far past its end means the tab was gone (sleep/closed):
// cancel instead of replaying transitions.
const STALE_PHASE_MS = 10 * 60_000;

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Header pill: shows the running timer, drives pomodoro cycles (25/5) and
 * auto-pauses after 10 minutes without any user input (idle detection).
 */
export function RunningTimer() {
  const { t } = useT();
  const { toast } = useToast();
  const router = useRouter();
  const [entry, setEntry] = useState<RunningEntry>(null);
  const [pomo, setPomo] = useState<PomodoroState | null>(null);
  const [idlePaused, setIdlePaused] = useState<{ taskId: string; taskTitle: string } | null>(null);
  const [, force] = useState(0);

  const entryRef = useRef(entry);
  entryRef.current = entry;
  const pomoRef = useRef(pomo);
  pomoRef.current = pomo;
  const lastActivityRef = useRef(Date.now());
  const busyRef = useRef(false);

  const load = useCallback(() => getRunningEntry().then((e) => setEntry(e)), []);

  // Watchdog: idle detection + pomodoro phase transitions. Runs every few
  // seconds; guarded by busyRef so slow server calls never overlap.
  const check = useCallback(async () => {
    if (busyRef.current) return;
    const e = entryRef.current;
    const p = pomoRef.current;
    const now = Date.now();

    if (e && now - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
      busyRef.current = true;
      try {
        await stopTimerAtAction(new Date(lastActivityRef.current).toISOString());
        savePomodoro(null);
        setPomo(null);
        setEntry(null);
        setIdlePaused({ taskId: e.taskId, taskTitle: e.taskTitle });
        toast(t("time.idleStopped"), "error");
        notifyBrowser(t("time.idleStopped"), e.taskTitle);
        router.refresh();
      } finally {
        busyRef.current = false;
      }
      return;
    }

    if (p && now >= p.phaseEndsAt) {
      busyRef.current = true;
      try {
        if (now - p.phaseEndsAt > STALE_PHASE_MS) {
          // Way overdue — tab was asleep. Stop cleanly at the phase end, no replay.
          if (e) await stopTimerAtAction(new Date(p.phaseEndsAt).toISOString());
          savePomodoro(null);
          setPomo(null);
          setEntry(null);
        } else if (p.phase === "focus") {
          if (e) await stopTimerAction();
          const next = nextPhase(p);
          savePomodoro(next);
          setPomo(next);
          setEntry(null);
          toast(t("pomodoro.breakStarted", { n: BREAK_MINUTES }));
          notifyBrowser(t("pomodoro.breakStarted", { n: BREAK_MINUTES }), p.taskTitle);
        } else {
          await startTimerAction(p.taskId, "pomodoro");
          const next = nextPhase(p);
          savePomodoro(next);
          setPomo(next);
          await load();
          toast(t("pomodoro.focusStarted", { n: FOCUS_MINUTES }));
          notifyBrowser(t("pomodoro.focusStarted", { n: FOCUS_MINUTES }), p.taskTitle);
        }
        router.refresh();
      } finally {
        busyRef.current = false;
      }
    }
  }, [load, router, t, toast]);

  // The effect below must register its listeners exactly once, but `check`
  // is recreated on every render (t/toast identities) — route through a ref.
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    let alive = true;
    const safeLoad = () => getRunningEntry().then((e) => alive && setEntry(e));
    safeLoad();
    setPomo(loadPomodoro());

    const onPomo = () => setPomo(loadPomodoro());
    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const poll = setInterval(safeLoad, 30000);
    const tick = setInterval(() => force((x) => x + 1), 1000);
    const watchdog = setInterval(() => void checkRef.current(), 3000);
    // start/stop from anywhere broadcasts this so the header updates instantly
    window.addEventListener("tt:timer", safeLoad);
    window.addEventListener(POMODORO_EVENT, onPomo);
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
      clearInterval(watchdog);
      window.removeEventListener("tt:timer", safeLoad);
      window.removeEventListener(POMODORO_EVENT, onPomo);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, []);

  // Idle-pause notice: shown after an auto-stop until resumed or dismissed.
  if (!entry && !pomo && idlePaused) {
    return (
      <div className="flex items-center gap-1.5 rounded-full bg-amber-50 py-1 ps-2.5 pe-1 text-xs ring-1 ring-amber-300">
        <span className="max-w-28 truncate font-medium text-amber-700" title={idlePaused.taskTitle}>
          ⏸ {t("time.idlePaused")}
        </span>
        <button
          onClick={async () => {
            await startTimerAction(idlePaused.taskId);
            setIdlePaused(null);
            await load();
            router.refresh();
          }}
          className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-white hover:bg-amber-600"
          aria-label={t("time.resume")}
          title={t("time.resume")}
        >
          <Play className="h-2.5 w-2.5 fill-current" />
        </button>
        <button
          onClick={() => setIdlePaused(null)}
          className="grid h-5 w-5 place-items-center rounded-full text-amber-600 hover:bg-amber-100"
          aria-label={t("time.dismiss")}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  // Pomodoro pill (covers the break, when no entry is running)
  if (pomo) {
    const isBreak = pomo.phase === "break";
    const title = entry?.taskTitle ?? pomo.taskTitle ?? "";
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-full py-1 ps-2.5 pe-1 text-xs ring-1",
          isBreak ? "bg-emerald-50 ring-emerald-200" : "bg-rose-50 ring-rose-200"
        )}
      >
        {isBreak ? <Coffee className="h-3.5 w-3.5 text-emerald-600" /> : <span aria-hidden>🍅</span>}
        <Link
          href={`/tasks/${pomo.taskId}`}
          className={cn("max-w-24 truncate font-medium hover:underline", isBreak ? "text-emerald-700" : "text-rose-700")}
          title={title}
        >
          {isBreak ? t("pomodoro.break") : title || t("pomodoro.focus")}
        </Link>
        <span className={cn("font-mono tabular-nums", isBreak ? "text-emerald-700" : "text-rose-700")}>
          {formatCountdown(remainingSeconds(pomo, Date.now()))}
        </span>
        <span className={cn("rounded-full px-1 text-[10px]", isBreak ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
          ×{pomo.cycle}
        </span>
        <button
          onClick={async () => {
            savePomodoro(null);
            setPomo(null);
            if (entryRef.current) await stopTimerAction();
            setEntry(null);
            router.refresh();
          }}
          className={cn(
            "grid h-5 w-5 place-items-center rounded-full text-white",
            isBreak ? "bg-emerald-500 hover:bg-emerald-600" : "bg-rose-500 hover:bg-rose-600"
          )}
          aria-label={t("pomodoro.stop")}
          title={t("pomodoro.stop")}
        >
          <Square className="h-2.5 w-2.5 fill-current" />
        </button>
      </div>
    );
  }

  if (!entry) return null;

  return (
    <div className="flex items-center gap-1.5 rounded-full bg-rose-50 py-1 ps-2.5 pe-1 text-xs ring-1 ring-rose-200">
      <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
      <Link href={`/tasks/${entry.taskId}`} className="max-w-28 truncate font-medium text-rose-700 hover:underline" title={entry.taskTitle}>
        {entry.taskTitle}
      </Link>
      <span className="font-mono tabular-nums text-rose-700">{clock(entry.startedAt)}</span>
      <button
        onClick={async () => { await stopTimerAction(); setEntry(null); router.refresh(); }}
        className="grid h-5 w-5 place-items-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
        aria-label="stop timer"
      >
        <Square className="h-2.5 w-2.5 fill-current" />
      </button>
    </div>
  );
}
