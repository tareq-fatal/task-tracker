"use client";

import { cn } from "@/lib/utils";
import { STATUS_STYLES, PRIORITY_STYLES } from "@/lib/tasks";
import { useT } from "@/components/i18n-provider";
import type { TaskPriority, TaskStatus } from "@/lib/enums";
import type { TKey } from "@/lib/i18n";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const style =
    STATUS_STYLES[status as TaskStatus] ?? STATUS_STYLES.Todo;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        style
      )}
    >
      {t(`status.${status}` as TKey)}
    </span>
  );
}

const TYPE_STYLES: Record<string, string> = {
  Epic: "bg-violet-100 text-violet-700 border-violet-200",
  Story: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Task: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Subtask: "bg-slate-100 text-slate-600 border-slate-200",
  Bug: "bg-rose-100 text-rose-700 border-rose-200",
};
const TYPE_ICON: Record<string, string> = {
  Epic: "⚡",
  Story: "📗",
  Task: "✓",
  Subtask: "◦",
  Bug: "🐞",
};

export function TypeBadge({ type }: { type: string }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        TYPE_STYLES[type] ?? TYPE_STYLES.Task
      )}
    >
      <span aria-hidden>{TYPE_ICON[type] ?? "✓"}</span>
      {t(`type.${type}` as TKey)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const { t } = useT();
  const style =
    PRIORITY_STYLES[priority as TaskPriority] ?? PRIORITY_STYLES.Medium;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        style
      )}
    >
      {t(`priority.${priority}` as TKey)}
    </span>
  );
}
