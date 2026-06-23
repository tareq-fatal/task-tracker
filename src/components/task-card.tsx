"use client";

import Link from "next/link";
import { MessageSquare, Paperclip, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/tasks";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { ProgressBar } from "@/components/progress-bar";
import { TimeBadge } from "@/components/time-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type TaskCardData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  progress: number;
  estimatedHours: number | null;
  spentHours: number;
  timerStartedAt: string | Date | null;
  completedAt: string | Date | null;
  assignedTo: { name: string } | null;
  project: { name: string; color: string } | null;
  _count?: { comments: number; attachments: number; subtasks: number };
};

export function TaskCard({
  task,
  showStatus = true,
}: {
  task: TaskCardData;
  showStatus?: boolean;
}) {
  const done = task.status === "Done" || task.status === "Archived";
  const subtaskCount = task._count?.subtasks ?? 0;
  const showBar = task.progress > 0 || subtaskCount > 0;

  return (
    <Link href={`/tasks/${task.id}`} className="block">
      <div
        className={cn(
          "group rounded-xl border bg-card p-4 shadow-sm transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md",
          done && "opacity-65"
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

        <p
          className={cn(
            "mb-3 line-clamp-2 text-sm font-medium leading-snug",
            done && "line-through decoration-muted-foreground/40"
          )}
        >
          {task.title}
        </p>

        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <PriorityBadge priority={task.priority} />
          {showStatus && <StatusBadge status={task.status} />}
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
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-secondary text-[10px]">
                {initials(task.assignedTo.name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </Link>
  );
}
