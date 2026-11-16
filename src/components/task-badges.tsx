"use client";

import { Zap, BookOpen, CheckSquare, CornerDownRight, Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_STYLES, PRIORITY_STYLES } from "@/lib/tasks";
import { sortTags } from "@/lib/tags";
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
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        style
      )}
    >
      {t(`status.${status}` as TKey)}
    </span>
  );
}

const TYPE_STYLES: Record<string, string> = {
  Epic: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-400/10 dark:text-violet-300 dark:border-violet-400/25",
  Story: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/25",
  Task: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-400/10 dark:text-slate-300 dark:border-slate-400/20",
  Subtask: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-400/10 dark:text-slate-400 dark:border-slate-400/20",
  Bug: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:border-rose-400/25",
};
// TOF-0962: Symbole statt Emoji (ruhig, gleichmäßige Linien)
const TYPE_ICON: Record<string, React.ElementType> = {
  Epic: Zap,
  Story: BookOpen,
  Task: CheckSquare,
  Subtask: CornerDownRight,
  Bug: Bug,
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
      {(() => {
        const Icon = TYPE_ICON[type] ?? CheckSquare;
        return <Icon className="h-3 w-3" aria-hidden />;
      })()}
      {t(`type.${type}` as TKey)}
    </span>
  );
}

/**
 * Schlagworte einer Aufgabe. Ruhige, einheitliche Plaketten - die Farbe ist
 * schon fuer Status und Prioritaet belegt; ein dritter Farbkreis wuerde die
 * Karte unlesbar machen. `max` schneidet ab und zeigt den Rest als Zahl.
 */
export function TagBadges({ tags, max = 0 }: { tags?: string[] | null; max?: number }) {
  const all = sortTags(tags ?? []);
  if (all.length === 0) return null;
  const shown = max > 0 ? all.slice(0, max) : all;
  const rest = all.length - shown.length;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full border border-border bg-transparent px-2 py-0.5 text-xs font-medium text-muted-foreground"
        >
          #{tag}
        </span>
      ))}
      {rest > 0 && <span className="text-xs text-muted-foreground">+{rest}</span>}
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
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        style
      )}
    >
      {t(`priority.${priority}` as TKey)}
    </span>
  );
}
