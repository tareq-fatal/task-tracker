"use client";

import Link from "next/link";
import { MessageSquare, Paperclip, ListChecks, AlertTriangle, CalendarClock, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { de, enUS, ar, tr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { initials, formatDuration } from "@/lib/tasks";
import type { TaskPriority } from "@/lib/enums";
import { dueBucket, type DueBucket } from "@/lib/due";
import { isImageMime } from "@/lib/attachment-view";
import { formatDate } from "@/lib/format";
import { StatusBadge, PriorityBadge, TagBadges } from "@/components/task-badges";
import { useT } from "@/components/i18n-provider";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

export type TaskCardData = {
  id: string;
  title: string;
  status: string;
  priority: string;
  tags?: string[];
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
  /** Image attachments for the card preview strip (max 3, see taskCardSelect). */
  attachments?: { id: string; fileName: string; mimeType: string }[];
};

const DATE_LOCALES = { de, en: enUS, ar, tr } as const;

// TOF-0962: Fälligkeit als ruhige Textzeile, nur „überfällig/heute“ farbig.
const DUE_STYLE: Record<DueBucket, string> = {
  overdue: "font-medium text-red-700 dark:text-red-300",
  today: "font-medium text-orange-700 dark:text-orange-300",
  week: "text-foreground",
  far: "text-muted-foreground",
};

/**
 * TOF-0962 „Calm“-Karte: Projekt · Titel · Plaketten · eine Fußzeile.
 * Keine farbige Seitenkante, kein Verlauf; Bilder nur als kleine Leiste.
 */
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
  const bucket = done ? null : dueBucket(task.dueDate, new Date());
  const avatarSrc =
    task.assignedTo?.avatar && /^https?:|^\//.test(task.assignedTo.avatar) ? task.assignedTo.avatar : undefined;
  // SVG is deliberately excluded from inline rendering everywhere (stored-XSS),
  // so it is not previewed here either.
  const previews = (task.attachments ?? []).filter((a) => isImageMime(a.mimeType));
  const extraImages = Math.max(0, (task._count?.attachments ?? 0) - previews.length);
  const openStatus = (s: string) => s !== "Done" && s !== "Archived";
  const waitingOn = done
    ? 0
    : (task.linksFrom ?? []).filter((l) => openStatus(l.linkedTask.status)).length +
      (task.linksTo ?? []).filter((l) => openStatus(l.task.status)).length;
  const running = Boolean(task.timerStartedAt);

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <article
        className={cn(
          "group rounded-xl border bg-card p-3.5 shadow-card transition-[border-color,box-shadow] duration-150",
          "hover:border-foreground/15 hover:shadow-raised",
          done && "bg-card/70"
        )}
      >
        <div className="mb-1.5 flex items-center gap-2">
          {task.project ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />
              <span className="truncate">{task.project.name}</span>
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {task.storyPoints != null && (
            <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-secondary-foreground">
              {task.storyPoints} P
            </span>
          )}
          {task.assignedTo && (
            <Avatar className="h-6 w-6 shrink-0" title={task.assignedTo.name}>
              {avatarSrc && <AvatarImage src={avatarSrc} alt={task.assignedTo.name} />}
              <AvatarFallback className="bg-primary-soft text-[10px] font-semibold text-primary-soft-foreground">
                {task.assignedTo.avatar && !avatarSrc ? task.assignedTo.avatar : initials(task.assignedTo.name)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        <p
          className={cn(
            "line-clamp-2 text-sm font-medium leading-snug text-foreground",
            done && "text-muted-foreground line-through decoration-muted-foreground/40"
          )}
        >
          {task.title}
        </p>

        {(!done || showStatus || (task.tags?.length ?? 0) > 0 || waitingOn > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {!done && <PriorityBadge priority={task.priority as TaskPriority} />}
            {showStatus && <StatusBadge status={task.status} />}
            <TagBadges tags={task.tags} max={2} />
            {waitingOn > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" />
                {t("links.waiting", { n: waitingOn })}
              </span>
            )}
          </div>
        )}

        {/* Bildvorschau — "164 Zeilen Text helfen nicht" (Tarek, 14.08.2026).
            Fehlt eine Datei, wird das Bild ausgeblendet statt kaputt gezeigt. */}
        {previews.length > 0 && (
          <div className="mt-2.5 flex gap-1.5">
            {previews.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={`/download/attachment/${a.id}?thumb=1`}
                alt={a.fileName}
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
                className="h-12 w-12 rounded-md bg-secondary object-cover ring-1 ring-border"
              />
            ))}
            {extraImages > 0 && (
              <span className="grid h-12 w-12 place-items-center rounded-md bg-secondary text-xs font-medium text-muted-foreground">
                +{extraImages}
              </span>
            )}
          </div>
        )}

        {task.progress > 0 && !done && (
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={task.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${task.progress}%`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, task.progress)}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">{task.progress}%</span>
          </div>
        )}

        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          {done && task.completedAt ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("time.doneAgo", {
                ago: formatDistanceToNowStrict(new Date(task.completedAt), { locale: DATE_LOCALES[locale] }),
              })}
            </span>
          ) : task.dueDate ? (
            <span className={cn("inline-flex items-center gap-1 tabular-nums", bucket ? DUE_STYLE[bucket] : "")}>
              <CalendarClock className="h-3.5 w-3.5" />
              {formatDate(task.dueDate, locale)}
            </span>
          ) : null}
          {task.estimatedHours != null && !done && (
            <span className={cn("inline-flex items-center gap-1 tabular-nums", running && "font-medium text-primary")}>
              <Clock className={cn("h-3.5 w-3.5", running && "motion-safe:animate-pulse")} />
              {formatDuration(task.spentHours)} / {formatDuration(task.estimatedHours)}
            </span>
          )}
          <span className="ms-auto inline-flex items-center gap-2.5">
            {subtaskCount > 0 && (
              <span className="inline-flex items-center gap-1" title={t("task.subtasks" as never)}>
                <ListChecks className="h-3.5 w-3.5" />
                {subtaskCount}
              </span>
            )}
            {task._count && task._count.comments > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {task._count.comments}
              </span>
            )}
            {task._count && task._count.attachments > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {task._count.attachments}
              </span>
            )}
          </span>
        </div>
      </article>
    </Link>
  );
}
