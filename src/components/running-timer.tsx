"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Square } from "lucide-react";
import { getRunningEntry, stopTimerAction, type RunningEntry } from "@/actions/time";

function clock(startedAtIso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startedAtIso).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function RunningTimer() {
  const router = useRouter();
  const [entry, setEntry] = useState<RunningEntry>(null);
  const [, force] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () => getRunningEntry().then((e) => alive && setEntry(e));
    load();
    const poll = setInterval(load, 30000);
    const tick = setInterval(() => force((x) => x + 1), 1000);
    // start/stop from anywhere broadcasts this so the header updates instantly
    window.addEventListener("tt:timer", load);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("tt:timer", load);
    };
  }, []);

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
