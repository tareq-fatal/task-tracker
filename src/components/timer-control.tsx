"use client";

import { useEffect, useState, useTransition } from "react";
import { Play, Square, Clock } from "lucide-react";
import { startTimerAction, stopTimerAction } from "@/actions/tasks";
import { formatDuration } from "@/lib/tasks";
import { Button } from "@/components/ui/button";
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
  const running = Boolean(timerStartedAt);
  const startMs = timerStartedAt ? new Date(timerStartedAt).getTime() : 0;

  const [nowMs, setNowMs] = useState<number>(() =>
    running ? startMs : 0
  );

  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, startMs]);

  const runningSeconds = running ? Math.max(0, (nowMs - startMs) / 1000) : 0;
  const liveSpent = spentHours + runningSeconds / 3600;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-sm">
        <Clock
          className={cn(
            "h-4 w-4 text-muted-foreground",
            running && "animate-pulse text-sky-600"
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
          <span className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-xs text-sky-700 tabular-nums">
            {fmtClock(runningSeconds)}
          </span>
        )}
      </div>

      {running ? (
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await stopTimerAction(taskId);
            })
          }
        >
          <Square className="me-1 h-4 w-4" />
          {t("task.stopTimer")}
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await startTimerAction(taskId);
            })
          }
        >
          <Play className="me-1 h-4 w-4" />
          {t("task.startTimer")}
        </Button>
      )}
    </div>
  );
}
