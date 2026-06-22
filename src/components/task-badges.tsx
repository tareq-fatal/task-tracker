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
