"use client";

import { useState, useTransition } from "react";
import { Check, ListChecks } from "lucide-react";
import { updateTaskProgressAction } from "@/actions/tasks";
import { ProgressBar } from "@/components/progress-bar";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

const QUICK = [50, 75, 100];

export function ProgressControl({
  taskId,
  value,
  hasSubtasks,
}: {
  taskId: string;
  value: number;
  hasSubtasks: boolean;
}) {
  const { t } = useT();
  const [progress, setProgress] = useState(value);
  const [, startTransition] = useTransition();

  function commit(v: number) {
    setProgress(v);
    startTransition(async () => {
      await updateTaskProgressAction(taskId, v);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t("task.progress")}
        </span>
        <div className="flex items-center gap-2">
          {hasSubtasks && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              <ListChecks className="h-3 w-3" />
              {t("task.auto")}
            </span>
          )}
          <span className="text-sm font-semibold tabular-nums">
            {hasSubtasks ? value : progress}%
          </span>
        </div>
      </div>

      <ProgressBar value={hasSubtasks ? value : progress} className="h-2.5" />

      {!hasSubtasks && (
        <div className="space-y-3">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={progress}
            onChange={(e) => setProgress(Number(e.target.value))}
            onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
            className="h-2 w-full cursor-pointer accent-sky-500"
            aria-label={t("task.progress")}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <Button
                key={q}
                type="button"
                size="sm"
                variant={progress === q ? "default" : "outline"}
                onClick={() => commit(q)}
                className={cn(q === 100 && "gap-1")}
              >
                {q === 100 && <Check className="h-4 w-4" />}
                {q}%
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
