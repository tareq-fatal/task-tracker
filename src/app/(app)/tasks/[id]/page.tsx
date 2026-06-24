import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  Pencil,
  CalendarClock,
  User as UserIcon,
  FileText,
  ImageIcon,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { initials, isOverdue } from "@/lib/tasks";
import { taskVisibility } from "@/lib/task-access";
import { cn } from "@/lib/utils";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { CommentForm } from "@/components/comment-form";
import { AttachmentUpload } from "@/components/attachment-upload";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { ProgressControl } from "@/components/progress-control";
import { SubtaskList } from "@/components/subtask-list";
import { TimerControl } from "@/components/timer-control";
import { TaskLinks } from "@/components/task-links";
import { CopyLinkButton } from "@/components/copy-link-button";
import { formatDuration } from "@/lib/tasks";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Locale } from "@/lib/enums";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function TaskDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: { select: { name: true } },
      createdBy: { select: { name: true } },
      project: { select: { id: true, name: true, color: true } },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      attachments: { orderBy: { uploadedAt: "desc" } },
      subtasks: { orderBy: { order: "asc" } },
      linksFrom: {
        include: {
          linkedTask: { select: { id: true, title: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      linksTo: {
        include: {
          task: { select: { id: true, title: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!task) notFound();

  const canEdit =
    user.role === "Admin" ||
    task.createdByUserId === user.id ||
    task.assignedToUserId === user.id;
  if (!canEdit) notFound();

  const overdue = isOverdue(task.dueDate, task.status as any);

  // Candidate tasks to link (visible to the user, excluding this one)
  const linkCandidates = await prisma.task.findMany({
    where: { id: { not: task.id }, ...taskVisibility(user) },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  return (
    <div className="container max-w-3xl py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t["common.back"]}
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <div className="flex flex-wrap gap-2">
          <CopyLinkButton />
          <Button asChild variant="outline" size="sm">
            <Link href={`/tasks/${task.id}/edit`}>
              <Pencil className="me-1 h-4 w-4" />
              {t["common.edit"]}
            </Link>
          </Button>
          <DeleteTaskButton taskId={task.id} />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        {task.project && (
          <Link
            href={`/projects/${task.project.id}`}
            className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: task.project.color }}
            />
            {task.project.name}
          </Link>
        )}
      </div>

      <Card className="mb-6">
        <CardContent className="space-y-4 p-5">
          {task.description ? (
            <p className="whitespace-pre-wrap text-sm">{task.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t["common.none"]}</p>
          )}

          <div className="grid grid-cols-1 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t["task.assignee"]}:</span>
              <span className="font-medium">
                {task.assignedTo?.name ?? t["task.unassigned"]}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t["task.dueDate"]}:</span>
              <span
                className={cn("font-medium", overdue && "text-rose-600")}
              >
                {task.dueDate
                  ? format(task.dueDate, "dd.MM.yyyy")
                  : t["common.none"]}
              </span>
            </div>
            {(task.estimatedHours != null || task.spentHours > 0) && (
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {t["task.spent"]}:
                </span>
                <span className="font-medium tabular-nums">
                  {formatDuration(task.spentHours)}
                  {task.estimatedHours != null && (
                    <>
                      {" "}
                      {t["time.of"]} {formatDuration(task.estimatedHours)}
                    </>
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              {t["task.createdBy"]}: {task.createdBy.name} ·{" "}
              {format(task.createdAt, "dd.MM.yyyy")}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timer */}
      <div className="mb-6">
        <TimerControl
          taskId={task.id}
          spentHours={task.spentHours}
          estimatedHours={task.estimatedHours}
          timerStartedAt={task.timerStartedAt}
        />
      </div>

      {/* Progress + Subtasks */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <ProgressControl
              taskId={task.id}
              value={task.progress}
              hasSubtasks={task.subtasks.length > 0}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <SubtaskList taskId={task.id} subtasks={task.subtasks} />
          </CardContent>
        </Card>
      </div>

      {/* Links / dependencies */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <TaskLinks
            taskId={task.id}
            links={task.linksFrom.map((l) => ({
              id: l.id,
              type: l.type,
              linkedTask: l.linkedTask,
            }))}
            incoming={task.linksTo.map((l) => ({
              id: l.id,
              type: l.type,
              task: l.task,
            }))}
            candidates={linkCandidates}
          />
        </CardContent>
      </Card>

      {/* Attachments */}
      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t["task.attachments"]} ({task.attachments.length})
          </h2>
          <AttachmentUpload taskId={task.id} />
        </div>
        {task.attachments.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {task.attachments.map((a) => (
              <a
                key={a.id}
                href={a.filePath}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm hover:bg-secondary/50"
              >
                {a.mimeType.startsWith("image/") ? (
                  <ImageIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                )}
                <span className="flex-1 truncate">{a.fileName}</span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(a.sizeBytes)}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Comments */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t["task.comments"]} ({task.comments.length})
        </h2>
        <div className="mb-4 space-y-3">
          {task.comments.length === 0 && (
            <p className="text-sm text-muted-foreground">{t["task.noComments"]}</p>
          )}
          {task.comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-secondary text-xs">
                  {initials(c.user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 rounded-lg border bg-card p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{c.user.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(c.createdAt, "dd.MM.yyyy HH:mm")}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.content}</p>
              </div>
            </div>
          ))}
        </div>
        <CommentForm taskId={task.id} />
      </section>
    </div>
  );
}
