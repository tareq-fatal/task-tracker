"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { BadgeEuro, Play, Square, Trash2 } from "lucide-react";
import {
  startTimerAction,
  stopTimerAction,
  addManualTimeAction,
  deleteTimeEntryAction,
  toggleBillableAction,
  type TimeActionState,
} from "@/actions/time";
import { formatMinutes } from "@/lib/time-tracking";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/components/i18n-provider";

export type TimeEntryView = {
  id: string;
  userName: string;
  minutes: number;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
  billable: boolean;
  source: string;
};

function AddBtn() {
  const { pending } = useFormStatus();
  const { t } = useT();
  return <Button type="submit" size="sm" variant="secondary" disabled={pending}>{t("time.add")}</Button>;
}

export function TimeTracking({
  taskId,
  entries,
  totalMinutes,
  runningOnThisTask,
}: {
  taskId: string;
  entries: TimeEntryView[];
  totalMinutes: number;
  runningOnThisTask: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, formAction] = useFormState<TimeActionState, FormData>(
    addManualTimeAction.bind(null, taskId),
    {}
  );
  const act = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      window.dispatchEvent(new Event("tt:timer")); // refresh the header timer
      router.refresh();
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {runningOnThisTask ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => act(() => stopTimerAction())}>
            <Square className="me-1 h-4 w-4 fill-current" /> {t("time.stop")}
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => act(() => startTimerAction(taskId))}>
            <Play className="me-1 h-4 w-4" /> {t("time.start")}
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {t("time.total")}: <span className="font-semibold text-foreground tabular-nums">{formatMinutes(totalMinutes)}</span>
        </span>
      </div>

      <form action={formAction} className="mb-3 flex flex-wrap items-end gap-2">
        <Input name="duration" placeholder={t("time.durationHint")} className="w-28" />
        <Input name="note" placeholder={t("time.note")} className="flex-1 min-w-40" />
        <label className="flex h-9 items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" name="billable" defaultChecked className="h-4 w-4 accent-emerald-600" />
          {t("time.billable")}
        </label>
        <AddBtn />
        {state.error && <span className="text-xs text-destructive">{t("time.durationHint")}</span>}
      </form>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("time.noEntries")}</p>
      ) : (
        <ul className="divide-y text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 py-1.5">
              <span className="font-medium">{e.userName}</span>
              <span className="tabular-nums text-indigo-600">
                {e.endedAt ? formatMinutes(e.minutes) : t("time.running")}
              </span>
              {e.note && <span className="truncate text-muted-foreground">· {e.note}</span>}
              <span className="ms-auto text-xs text-muted-foreground">{new Date(e.startedAt).toLocaleDateString()}</span>
              <button
                onClick={() => act(() => toggleBillableAction(e.id))}
                title={e.billable ? t("time.billable") : t("time.nonBillable")}
                aria-label={t("time.toggleBillable")}
                className={cn(
                  "transition-colors",
                  e.billable ? "text-emerald-600 hover:text-emerald-700" : "text-muted-foreground/40 hover:text-muted-foreground"
                )}
              >
                <BadgeEuro className="h-4 w-4" />
              </button>
              <button
                onClick={() => act(() => deleteTimeEntryAction(e.id))}
                className="text-muted-foreground hover:text-destructive"
                aria-label={t("time.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
