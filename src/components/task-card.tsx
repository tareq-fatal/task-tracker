"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CalendarClock, MessageSquare, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOverdue, isDueToday, initials } from "@/lib/tasks";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { useT } from "@/components/i18n-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export type TaskCardData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  assignedTo: { name: string } | null;
  project: { name: string; color: string } | null;
  _count?: { comments: number; attachments: number };
};

export function TaskCard({
  task,
  showStatus = true,
}: {
  task: TaskCardData;
  showStatus?: boolean;
}) {
  const { t } = useT();
  const overdue = isOverdue(task.dueDate, task.status as any);
  const dueToday = !overdue && isDueToday(task.dueDate);

  return (
    <Link href={`/tasks/${task.id}`} className="block">
      <div className="group rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
        {task.project && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: task.project.color }}
            />
            <span className="truncate text-xs text-muted-foreground">
              {task.project.name}
            </span>
          </div>
        )}

        <p className="mb-2 line-clamp-2 text-sm font-medium leading-snug">
          {task.title}
        </p>

        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {showStatus && <StatusBadge status={task.status} />}
          <PriorityBadge priority={task.priority} />
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {task.dueDate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
                  overdue && "bg-red-100 font-medium text-red-700",
                  dueToday && "bg-amber-100 font-medium text-amber-700"
                )}
              >
                <CalendarClock className="h-3 w-3" />
                {format(new Date(task.dueDate), "dd.MM.yyyy")}
              </span>
            )}
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
