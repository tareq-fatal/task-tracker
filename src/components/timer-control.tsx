"use client";

import { useEffect, useState, useTransition } from "react";
import { Play, Square, Clock } from "lucide-react";
import { startTimerAction, stopTimerAction } from "@/actions/tasks";
import { formatDuration } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
import { TooltipHelp } from "@/components/ui/tooltip";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export function TimerControl({
  taskId,
  spentHours,
  estimatedHours,
  timerStartedAt,
}: {
  taskId: string;
  spentHours: number;
  estimatedHours: number | null;
  timerStartedAt: string | Date | null;
}) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();

  // Optimistic local state: respond to Start/Stop INSTANTLY, don't wait for the
  // server round-trip + revalidation (that lag made the timer look broken).
  const propStart = timerStartedAt ? new Date(timerStartedAt).getTime() : null;
  const [localStart, setLocalStart] = useState<number | null>(propStart);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // keep in sync if the server prop changes (e.g. after navigation)
  useEffect(() => { setLocalStart(propStart); }, [timerStartedAt]);

  const running = localStart !== null;
  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, localStart]);

  const runningSeconds = running ? Math.max(0, (nowMs - localStart!) / 1000) : 0;
  const liveSpent = spentHours + runningSeconds / 3600;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-sm">
        <Clock
          className={cn(
            "h-4 w-4 text-muted-foreground",
            running && "animate-pulse text-indigo-600"
          )}
        />
        <span className="font-medium tabular-nums">
          {formatDuration(liveSpent)}
          {estimatedHours != null && (
            <span className="text-muted-foreground">
              {" "}
              {t("time.of")} {formatDuration(estimatedHours)}
            </span>
          )}
        </span>
        {running && (
          <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-xs text-indigo-700 tabular-nums">
            {fmtClock(runningSeconds)}
          </span>
        )}
      </div>

      {running ? (
        <TooltipHelp textKey="tooltip.timer_stop">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setLocalStart(null); // optimistic stop
              startTransition(async () => { await stopTimerAction(taskId); });
            }}
          >
            <Square className="me-1 h-4 w-4" />
            {t("task.stopTimer")}
          </Button>
        </TooltipHelp>
      ) : (
        <TooltipHelp textKey="tooltip.timer_start">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              setLocalStart(Date.now()); // optimistic start
              startTransition(async () => { await startTimerAction(taskId); });
            }}
          >
            <Play className="me-1 h-4 w-4" />
            {t("task.startTimer")}
          </Button>
        </TooltipHelp>
      )}
    </div>
  );
}
