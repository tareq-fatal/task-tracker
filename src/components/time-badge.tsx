"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { ar, de, enUS } from "date-fns/locale";
import { Clock, CalendarDays, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  runningHours,
  isOverdue,
  isDueToday,
  daysUntil,
  overdueDaysCount,
} from "@/lib/tasks";
import { useT } from "@/components/i18n-provider";
import type { Locale } from "@/lib/enums";

const DATE_LOCALES: Record<Locale, typeof ar> = { ar, de, en: enUS };

export type TimeInfo = {
  status: string;
  dueDate: string | Date | null;
  estimatedHours: number | null;
  spentHours: number;
  timerStartedAt: string | Date | null;
  completedAt: string | Date | null;
};

export function TimeBadge({ task }: { task: TimeInfo }) {
  const { t, locale } = useT();
  const dateLocale = DATE_LOCALES[locale];

  // Done → "✅ Done X ago"
  if (task.status === "Done" && task.completedAt) {
    const ago = formatDistanceToNowStrict(new Date(task.completedAt), {
      locale: dateLocale,
    });
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        {t("time.doneAgo", { ago })}
      </span>
    );
  }

  const effectiveSpent =
    task.spentHours + runningHours(task.timerStartedAt);
  const running = Boolean(task.timerStartedAt);

  const overdue = isOverdue(task.dueDate, task.status as any);
  const dueToday = !overdue && isDueToday(task.dueDate);

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {task.estimatedHours != null && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-muted-foreground",
            running && "font-medium text-sky-600"
          )}
        >
          <Clock className={cn("h-3 w-3", running && "animate-pulse")} />
          {formatDuration(effectiveSpent)} {t("time.of")}{" "}
          {formatDuration(task.estimatedHours)}
        </span>
      )}

      {task.dueDate && overdue && (
        <span className="inline-flex animate-pulse items-center gap-1 rounded px-1.5 py-0.5 font-medium text-rose-700 bg-rose-100">
          <AlertTriangle className="h-3 w-3" />
          {t("time.overdueBy", { n: overdueDaysCount(task.dueDate) })}
        </span>
      )}

      {task.dueDate && dueToday && (
        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
          <CalendarDays className="h-3 w-3" />
          {t("dashboard.dueToday")}
        </span>
      )}

      {task.dueDate && !overdue && !dueToday && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CalendarDays className="h-3 w-3" />
          {t("time.daysLeft", { n: daysUntil(task.dueDate) })}
        </span>
      )}
    </span>
  );
}
