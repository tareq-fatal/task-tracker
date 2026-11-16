"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { dueBucket } from "@/lib/due";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/task-badges";
import { useT } from "@/components/i18n-provider";
import type { TaskPriority } from "@/lib/enums";

/**
 * TOF-0962: kompakte Aufgabenzeile (Dashboard, Projekt-Übersicht).
 * Ganze Zeile ist der Link — Antippfläche ≥ 52 px.
 */
export type TaskRowData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  project?: { name: string; color: string } | null;
  assignedTo?: { name: string } | null;
};

export const PRIORITY_DOT: Record<TaskPriority, string> = {
  Low: "bg-slate-300 dark:bg-slate-500",
  Medium: "bg-amber-400",
  High: "bg-orange-500",
  Critical: "bg-red-500",
};

const DUE_TEXT = {
  overdue: "text-red-700 dark:text-red-300",
  today: "text-orange-700 dark:text-orange-300",
  week: "text-foreground",
  far: "text-muted-foreground",
} as const;

export function TaskRow({
  task,
  showStatus = true,
  showProject = true,
}: {
  task: TaskRowData;
  showStatus?: boolean;
  showProject?: boolean;
}) {
  const { t, locale } = useT();
  const done = task.status === "Done" || task.status === "Archived";
  const bucket = done ? null : dueBucket(task.dueDate, new Date());
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="group flex min-h-[52px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60"
      data-testid="task-row"
    >
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", PRIORITY_DOT[task.priority as TaskPriority] ?? "bg-slate-300")}
        title={t(`priority.${task.priority}` as never)}
        aria-label={t(`priority.${task.priority}` as never)}
      />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-sm font-medium", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
        {showProject && task.project && (
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
      </span>
      {task.dueDate && (
        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 text-xs tabular-nums xs:inline-flex",
            bucket ? DUE_TEXT[bucket] : "text-muted-foreground"
          )}
        >
          <CalendarClock className="h-3.5 w-3.5 opacity-70" />
          {formatDate(task.dueDate, locale)}
        </span>
      )}
      {showStatus && (
        <span className="hidden shrink-0 sm:inline-flex">
          <StatusBadge status={task.status} />
        </span>
      )}
    </Link>
  );
}
