"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, SkipForward, Zap, X } from "lucide-react";
import {
  pauseRecurringAction,
  resumeRecurringAction,
  skipNextRecurringAction,
  runRecurringNowAction,
  stopRecurringAction,
} from "@/actions/recurring";
import { useT } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";

// Creator/admin controls for a recurring series, shown on the task detail page.
export function RecurringControls({
  taskId,
  paused,
}: {
  taskId: string;
  paused: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      {paused ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => resumeRecurringAction(taskId))}
        >
          <Play className="me-1 h-4 w-4" />
          {t("recurrence.resume")}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => pauseRecurringAction(taskId))}
        >
          <Pause className="me-1 h-4 w-4" />
          {t("recurrence.pause")}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => skipNextRecurringAction(taskId))}
      >
        <SkipForward className="me-1 h-4 w-4" />
        {t("recurrence.skip")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run(() => runRecurringNowAction(taskId))}
      >
        <Zap className="me-1 h-4 w-4" />
        {t("recurrence.runNow")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-rose-600 hover:text-rose-700"
        disabled={pending}
        onClick={() => run(() => stopRecurringAction(taskId))}
      >
        <X className="me-1 h-4 w-4" />
        {t("recurrence.stop")}
      </Button>
    </div>
  );
}
