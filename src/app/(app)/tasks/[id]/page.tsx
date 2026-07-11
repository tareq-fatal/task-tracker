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
  Repeat,
} from "lucide-react";
import { RecurringControls } from "@/components/recurring-controls";
import { describeSchedule } from "@/lib/recurring-describe";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { initials, isOverdue, commentReadByAll } from "@/lib/tasks";
import { MarkCommentsRead } from "@/components/mark-comments-read";
import { Check, CheckCheck } from "lucide-react";
import { isAdminRole } from "@/lib/enums";
import { taskVisibility, canEditTaskContent } from "@/lib/task-access";
import { StatusControl } from "@/components/status-control";
import { SupportTools } from "@/components/support-tools";
import { AlertTriangle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge, PriorityBadge, TypeBadge } from "@/components/task-badges";
import { rollup } from "@/lib/hierarchy";
import { CommentForm } from "@/components/comment-form";
import { AttachmentUpload } from "@/components/attachment-upload";
import { isImageMime, isInlineViewable } from "@/lib/attachment-view";
import { DeleteTaskButton } from "@/components/delete-task-button";
import { ChangeCreator } from "@/components/change-creator";
import { ProgressControl } from "@/components/progress-control";
import { SubtaskList } from "@/components/subtask-list";
import { TimerControl } from "@/components/timer-control";
import { TaskLinks } from "@/components/task-links";
import { ActivityFeed } from "@/components/activity-feed";
import { TaskCustomFields } from "@/components/task-custom-fields";
import { parseOptions, type FieldType } from "@/lib/custom-fields";
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
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
      createdBy: { select: { name: true } },
      project: { select: { id: true, name: true, color: true } },
      parent: { select: { id: true, title: true, type: true } },
      children: {
        select: { id: true, title: true, status: true, type: true, storyPoints: true, progress: true },
        orderBy: { createdAt: "asc" },
      },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      commentReads: { select: { userId: true, lastReadAt: true } },
      attachments: { orderBy: { uploadedAt: "desc" } },
      subtasks: { orderBy: { order: "asc" } },
      customValues: true,
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
      activity: {
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  if (!task || task.tenantId !== tenant.id) notFound();

  const isAssignee = task.assignees.some((a) => a.userId === user.id);
  const canView =
    isAdminRole(user.role) || task.createdByUserId === user.id || isAssignee;
  if (!canView) notFound();

  // #36 — content edit (title/desc/assignee/due/priority/…) is creator-or-admin only.
  const canEditContent = canEditTaskContent(user, task);
  const overdue = isOverdue(task.dueDate, task.status as any);

  // #13 — co-assignees are everyone assigned except the Hauptkopf (primary)
  const coAssignees = task.assignees
    .filter((a) => a.userId !== task.assignedToUserId)
    .map((a) => a.user);

  // Dependencies: open blockers of this task (outgoing DependsOn + incoming
  // Blocks) and open tasks waiting on this one (the inverse). Deduped by id.
  const openStatus = (s: string) => s !== "Done" && s !== "Archived";
  const blockerMap = new Map<string, { id: string; title: string; status: string }>();
  for (const l of task.linksFrom)
    if (l.type === "DependsOn" && openStatus(l.linkedTask.status)) blockerMap.set(l.linkedTask.id, l.linkedTask);
  for (const l of task.linksTo)
    if (l.type === "Blocks" && openStatus(l.task.status)) blockerMap.set(l.task.id, l.task);
  const blockedBy = [...blockerMap.values()];

  const blocksMap = new Map<string, { id: string; title: string; status: string }>();
  for (const l of task.linksFrom)
    if (l.type === "Blocks" && openStatus(l.linkedTask.status)) blocksMap.set(l.linkedTask.id, l.linkedTask);
  for (const l of task.linksTo)
    if (l.type === "DependsOn" && openStatus(l.task.status)) blocksMap.set(l.task.id, l.task);
  const blocks = [...blocksMap.values()];

  const isBlocked = openStatus(task.status) && blockedBy.length > 0;

  // #24 — admin support state
  const isAdmin = isAdminRole(user.role);
  const escalated = task.escalatedAt != null;
  const isAssisting = task.assignees.some((a) => a.userId === user.id);

  // #12 — read-receipts: watchers = all assignees + creator; a comment I wrote is
  // ✓✓ once every OTHER watcher has read past it.
  const watcherIds = new Set<string>([
    ...task.assignees.map((a) => a.userId),
    task.createdByUserId,
  ]);
  const readsMap: Record<string, number> = {};
  for (const r of task.commentReads) readsMap[r.userId] = r.lastReadAt.getTime();
  const otherWatchers = [...watcherIds].filter((id) => id !== user.id);

  // Admin-only: users of this tenant, for the "change creator" control
  const tenantUsers = isAdminRole(user.role)
    ? await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  // Custom fields: tenant-wide (projectId null) + this task's project, then values.
  const fieldDefs = await prisma.customFieldDef.findMany({
    where: {
      tenantId: tenant.id,
      OR: [{ projectId: null }, ...(task.projectId ? [{ projectId: task.projectId }] : [])],
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const valueMap = new Map(task.customValues.map((v) => [v.fieldId, v.value]));
  const customFields = fieldDefs.map((d) => ({
    id: d.id, name: d.name, type: d.type as FieldType, options: parseOptions(d.options), required: d.required,
    value: valueMap.get(d.id) ?? "",
  }));
  // Options for `user`-type fields — all tenant members (id + name).
  const cfUsers = fieldDefs.some((d) => d.type === "user")
    ? await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];

  // Candidate tasks to link (visible to the user, excluding this one)
  const linkCandidates = await prisma.task.findMany({
    where: { id: { not: task.id }, ...(await taskVisibility(user, tenant.id)) },
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

      {task.parent && (
        <div className="mb-2 flex items-center gap-1 text-sm text-muted-foreground">
          <TypeBadge type={task.parent.type} />
          <Link href={`/tasks/${task.parent.id}`} className="hover:underline">
            {task.parent.title}
          </Link>
          <span className="px-1">/</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <div className="flex flex-wrap gap-2">
          <CopyLinkButton />
          {canEditContent && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/tasks/${task.id}/edit`}>
                <Pencil className="me-1 h-4 w-4" />
                {t["common.edit"]}
              </Link>
            </Button>
          )}
          {(isAdminRole(user.role) || task.createdByUserId === user.id) && <DeleteTaskButton taskId={task.id} />}
        </div>
      </div>

      {/* #39 — for people who don't edit the content, we simply surface the one
          thing they DO drive: the status. No banner, no lock, no "read-only". */}
      {!canEditContent && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5">
          <StatusControl taskId={task.id} status={task.status} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TypeBadge type={task.type} />
        <StatusBadge status={task.status} />
        <PriorityBadge priority={task.priority} />
        {task.storyPoints != null && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
            {task.storyPoints} SP
          </span>
        )}
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

      {/* #24 — escalation banner (visible to everyone on the task) */}
      {escalated && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4" />
          {t["support.escalatedBanner"]}
        </div>
      )}

      {/* Dependencies — blocked banner + clickable chips, visible to everyone */}
      {isBlocked && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <Ban className="h-4 w-4" />
            {t["links.blockedBy"]}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {blockedBy.map((b) => (
              <Link
                key={b.id}
                href={`/tasks/${b.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-card px-2.5 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-500/40 dark:hover:bg-amber-500/20"
              >
                <span className="max-w-[16rem] truncate">{b.title}</span>
                <StatusBadge status={b.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tasks waiting on this one (inverse direction) */}
      {openStatus(task.status) && blocks.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t["links.blocksList"]}:</span>
          {blocks.map((b) => (
            <Link
              key={b.id}
              href={`/tasks/${b.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium hover:bg-secondary/60"
            >
              <span className="max-w-[16rem] truncate">{b.title}</span>
              <StatusBadge status={b.status} />
            </Link>
          ))}
        </div>
      )}

      {/* #24 — admin-only support tools */}
      {isAdmin && (
        <div className="mb-6">
          <SupportTools taskId={task.id} escalated={escalated} isAssisting={isAssisting} />
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="space-y-4 p-5">
          {task.description ? (
            <p className="whitespace-pre-wrap text-sm">{task.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t["common.none"]}</p>
          )}

          <div className="grid grid-cols-1 gap-3 border-t pt-4 text-sm sm:grid-cols-2">
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <UserIcon className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{t["task.assignee"]}:</span>
              {task.assignedTo ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                  🎖️ {task.assignedTo.name}
                  <span className="opacity-70">· {t["task.hauptkopf"]}</span>
                </span>
              ) : (
                <span className="font-medium">{t["task.unassigned"]}</span>
              )}
              {coAssignees.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                >
                  {u.name}
                </span>
              ))}
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
            {/* #39 — origin is a quiet footnote, not a badge. No colours, no shield. */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {task.createdByUserId === user.id
                  ? t["task.origin.self"]
                  : `${t["task.origin.assigned"]} ${task.createdBy.name}`}
                {" · "}
                {format(task.createdAt, "dd.MM.yyyy")}
              </span>
              {isAdminRole(user.role) && (
                <ChangeCreator taskId={task.id} users={tenantUsers} currentCreatorId={task.createdByUserId} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recurrence — this task is a series template */}
      {(task.recurringRule || task.recurringCron) && (
        <Card className="mb-6 border-indigo-200 dark:border-indigo-500/30">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Repeat className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t["recurrence.title"]}
                </h2>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  task.recurringPaused
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                )}
              >
                {task.recurringPaused ? t["recurrence.paused"] : t["recurrence.active"]}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t["recurrence.title"]}:</span>
                <span className="font-medium">
                  {describeSchedule(task, t as unknown as Record<string, string>)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">{t["recurrence.nextRun"]}:</span>
                <span className="font-medium tabular-nums">
                  {task.recurringNextAt
                    ? format(task.recurringNextAt, "dd.MM.yyyy HH:mm")
                    : t["common.none"]}
                  {task.recurringTz ? ` · ${task.recurringTz}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{t["recurrence.spawned"]}:</span>
                <span className="font-medium tabular-nums">
                  {task.recurringCount}
                  {task.recurringEndCount != null
                    ? ` ${t["recurrence.of"]} ${task.recurringEndCount}`
                    : ""}
                </span>
              </div>
              {task.recurringUntil && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t["recurrence.end.until"]}:</span>
                  <span className="font-medium tabular-nums">
                    {format(task.recurringUntil, "dd.MM.yyyy")}
                  </span>
                </div>
              )}
            </div>

            {canEditContent && (
              <div className="mt-4 border-t pt-3">
                <RecurringControls taskId={task.id} paused={task.recurringPaused} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Children (Epic/Story roll-up) */}
      {task.children.length > 0 && (() => {
        const r = rollup(task.children.map((c) => ({ status: c.status as never, progress: c.progress, storyPoints: c.storyPoints })));
        return (
          <Card className="mb-6">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t["hierarchy.children"]} ({r.done}/{r.total}
                  {r.totalPoints > 0 ? ` · ${r.donePoints}/${r.totalPoints} SP` : ""})
                </h2>
                <span className="text-sm font-semibold text-indigo-600">{r.progress}%</span>
              </div>
              <div className="mb-3 h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-pink-500" style={{ width: `${r.progress}%` }} />
              </div>
              <ul className="divide-y">
                {task.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-2 text-sm">
                    <TypeBadge type={c.type} />
                    <Link href={`/tasks/${c.id}`} className="flex-1 truncate hover:underline">
                      {c.title}
                    </Link>
                    {c.storyPoints != null && (
                      <span className="text-xs text-muted-foreground">{c.storyPoints} SP</span>
                    )}
                    <StatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })()}

      {/* Timer */}
      <div className="mb-6">
        <TimerControl
          taskId={task.id}
          spentHours={task.spentHours}
          estimatedHours={task.estimatedHours}
          timerStartedAt={task.timerStartedAt}
        />
      </div>

      {/* Progress + Subtasks + Links — content, so creator/admin only (#36) */}
      {canEditContent && (
        <>
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

          <TaskCustomFields taskId={task.id} fields={customFields} users={cfUsers} canEdit={canEditContent} />
        </>
      )}

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
            {task.attachments.map((a) => {
              const inline = isInlineViewable(a.mimeType);
              const image = isImageMime(a.mimeType);
              const href = `/download/attachment/${a.id}${inline ? "?inline=1" : ""}`;
              return (
                <a
                  key={a.id}
                  href={href}
                  {...(inline
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : { download: a.fileName })}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm hover:bg-secondary/50"
                >
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/download/attachment/${a.id}?inline=1`}
                      alt={a.fileName}
                      loading="lazy"
                      className="h-11 w-11 shrink-0 rounded object-cover ring-1 ring-black/5"
                    />
                  ) : a.mimeType.startsWith("image/") ? (
                    <ImageIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{a.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatBytes(a.sizeBytes)}
                  </span>
                </a>
              );
            })}
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
          {task.comments.map((c) => {
            // #12 — receipts on MY own comments: ✓ sent, ✓✓ read by all others
            const mine = c.userId === user.id;
            const readByAll = mine && commentReadByAll(c.createdAt.getTime(), otherWatchers, readsMap);
            return (
              <div key={c.id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-secondary text-xs">
                    {initials(c.user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 rounded-lg border bg-card p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{c.user.name}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {format(c.createdAt, "dd.MM.yyyy HH:mm")}
                      {mine &&
                        (readByAll ? (
                          <CheckCheck className="h-3.5 w-3.5 text-sky-500" aria-label={t["receipt.read"]} />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label={t["receipt.sent"]} />
                        ))}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{c.content}</p>
                </div>
              </div>
            );
          })}
        </div>
        <CommentForm taskId={task.id} />
        <MarkCommentsRead taskId={task.id} />
      </section>

      {/* Activity */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t["activity.title"]}
        </h2>
        <ActivityFeed
          items={task.activity.map((a) => ({
            id: a.id,
            type: a.type,
            detail: a.detail,
            createdAt: a.createdAt,
            userName: a.user.name,
          }))}
        />
      </section>
    </div>
  );
}
