"use client";

import Link from "next/link";
import { MessageSquare, Paperclip, ListChecks, AlertTriangle, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials, PRIORITY_ACCENT } from "@/lib/tasks";
import type { TaskPriority } from "@/lib/enums";
import { dueBucket, type DueBucket } from "@/lib/due";
import { formatDate } from "@/lib/format";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { ProgressBar } from "@/components/progress-bar";
import { TimeBadge } from "@/components/time-badge";
import { useT } from "@/components/i18n-provider";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export type TaskCardData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  storyPoints?: number | null;
  progress: number;
  estimatedHours: number | null;
  spentHours: number;
  timerStartedAt: string | Date | null;
  completedAt: string | Date | null;
  assignedTo: { name: string; avatar?: string | null } | null;
  project: { name: string; color: string } | null;
  _count?: { comments: number; attachments: number; subtasks: number };
  linksFrom?: { linkedTask: { status: string } }[];
  linksTo?: { task: { status: string } }[];
};

const PRIORITY_DOT: Record<TaskPriority, string> = {
  Low: "bg-slate-400",
  Medium: "bg-sky-500",
  High: "bg-amber-500",
  Critical: "bg-rose-500",
};

const DUE_STYLE: Record<DueBucket, string> = {
  overdue: "border-rose-200 bg-rose-50 text-rose-700",
  today: "border-orange-200 bg-orange-50 text-orange-700",
  week: "border-sky-200 bg-sky-50 text-sky-700",
  far: "border-slate-200 bg-slate-50 text-slate-500",
};

export function TaskCard({
  task,
  showStatus = true,
}: {
  task: TaskCardData;
  showStatus?: boolean;
}) {
  const { t, locale } = useT();
  const done = task.status === "Done" || task.status === "Archived";
  const subtaskCount = task._count?.subtasks ?? 0;
  const showBar = task.progress > 0 || subtaskCount > 0;
  const bucket = done ? null : dueBucket(task.dueDate, new Date());
  const avatarSrc = task.assignedTo?.avatar && /^https?:|^\//.test(task.assignedTo.avatar) ? task.assignedTo.avatar : undefined;
  const openStatus = (s: string) => s !== "Done" && s !== "Archived";
  const waitingOn = done
    ? 0
    : (task.linksFrom ?? []).filter((l) => openStatus(l.linkedTask.status))
        .length +
      (task.linksTo ?? []).filter((l) => openStatus(l.task.status)).length;

  return (
    <Link href={`/tasks/${task.id}`} className="block">
      <div
        className={cn(
          "group rounded-xl border border-s-4 bg-card p-4 shadow-sm transition-all duration-200",
          PRIORITY_ACCENT[task.priority as TaskPriority] ?? "border-s-slate-300",
          "hover:-translate-y-0.5 hover:shadow-lg",
          "active:scale-[0.99]",
          done && "opacity-60"
        )}
      >
        {task.project && (
          <div className="mb-2 flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: task.project.color }}
            />
            <span className="truncate text-xs text-muted-foreground">
              {task.project.name}
            </span>
          </div>
        )}

        <div className="mb-3 flex items-start gap-2">
          <span
            className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", PRIORITY_DOT[task.priority as TaskPriority] ?? "bg-slate-300")}
            aria-hidden
          />
          <p
            className={cn(
              "line-clamp-2 text-sm font-medium leading-snug",
              done && "line-through decoration-muted-foreground/40"
            )}
          >
            {task.title}
          </p>
          {task.storyPoints != null && (
            <span className="ms-auto shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
              {task.storyPoints} P
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {showStatus && <StatusBadge status={task.status} />}
          {bucket && (
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", DUE_STYLE[bucket])}>
              <CalendarClock className="h-3 w-3" />
              {formatDate(task.dueDate!, locale)}
            </span>
          )}
          {waitingOn > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {t("links.waiting", { n: waitingOn })}
            </span>
          )}
        </div>

        {showBar && (
          <div className="mb-3 space-y-1">
            <ProgressBar value={task.progress} />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              {subtaskCount > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="h-3 w-3" />
                  {subtaskCount}
                </span>
              ) : (
                <span />
              )}
              <span className="tabular-nums">{task.progress}%</span>
            </div>
          </div>
        )}

        <div className="mb-3">
          <TimeBadge task={task} />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {task._count && task._count.comments > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-3 w-3" />
                {task._count.comments}
              </span>
            )}
            {task._count && task._count.attachments > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="h-3 w-3" />
                {task._count.attachments}
              </span>
            )}
          </div>
          {task.assignedTo && (
            <Avatar className="h-6 w-6 ring-2 ring-background" title={task.assignedTo.name}>
              {avatarSrc && <AvatarImage src={avatarSrc} alt={task.assignedTo.name} />}
              <AvatarFallback className="bg-gradient-to-br from-indigo-400 to-fuchsia-400 text-[10px] font-semibold text-white">
                {task.assignedTo.avatar && !avatarSrc ? task.assignedTo.avatar : initials(task.assignedTo.name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </Link>
  );
}
