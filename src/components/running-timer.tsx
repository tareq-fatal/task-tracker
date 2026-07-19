"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play, Square, X } from "lucide-react";
import {
  getRunningEntry,
  startTimerAction,
  stopTimerAtAction,
  stopTimerAction,
  type RunningEntry,
} from "@/actions/time";
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

/** Auto-stop a running timer after this long without any user input. */
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Best-effort OS notification (only when permission was already granted). */
function notifyBrowser(title: string, body?: string): void {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, body ? { body } : undefined);
    }
  } catch {
    /* unsupported environment */
  }
}

const ACTIVITY_EVENTS = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * Header pill: shows the running timer and auto-pauses after 10 minutes
 * without any user input (idle detection).
 */
export function RunningTimer() {
  const { t } = useT();
  const { toast } = useToast();
  const router = useRouter();
  const [entry, setEntry] = useState<RunningEntry>(null);
  const [idlePaused, setIdlePaused] = useState<{ taskId: string; taskTitle: string } | null>(null);
  const [, force] = useState(0);

  const entryRef = useRef(entry);
  entryRef.current = entry;
  const lastActivityRef = useRef(Date.now());
  const busyRef = useRef(false);

  const load = useCallback(() => getRunningEntry().then((e) => setEntry(e)), []);

  // Watchdog: idle detection. Runs every few seconds; guarded by busyRef so
  // slow server calls never overlap.
  const check = useCallback(async () => {
    if (busyRef.current) return;
    const e = entryRef.current;
    const now = Date.now();

    if (e && now - lastActivityRef.current >= IDLE_TIMEOUT_MS) {
      busyRef.current = true;
      try {
        await stopTimerAtAction(new Date(lastActivityRef.current).toISOString());
        setEntry(null);
        setIdlePaused({ taskId: e.taskId, taskTitle: e.taskTitle });
        toast(t("time.idleStopped"), "error");
        notifyBrowser(t("time.idleStopped"), e.taskTitle);
        router.refresh();
      } finally {
        busyRef.current = false;
      }
    }
  }, [router, t, toast]);

  // The effect below must register its listeners exactly once, but `check`
  // is recreated on every render (t/toast identities) — route through a ref.
  const checkRef = useRef(check);
  checkRef.current = check;

  useEffect(() => {
    let alive = true;
    const safeLoad = () => getRunningEntry().then((e) => alive && setEntry(e));
    safeLoad();

    const onActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const poll = setInterval(safeLoad, 30000);
    const tick = setInterval(() => force((x) => x + 1), 1000);
    const watchdog = setInterval(() => void checkRef.current(), 3000);
    // start/stop from anywhere broadcasts this so the header updates instantly
    window.addEventListener("tt:timer", safeLoad);
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true });
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
      clearInterval(watchdog);
      window.removeEventListener("tt:timer", safeLoad);
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity);
    };
  }, []);

  // Idle-pause notice: shown after an auto-stop until resumed or dismissed.
  if (!entry && idlePaused) {
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
