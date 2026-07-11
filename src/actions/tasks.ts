"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import {
  taskSchema,
  commentSchema,
  subtaskSchema,
  progressSchema,
  MAX_UPLOAD_BYTES,
  ALLOWED_MIME,
  ALLOWED_AUDIO_MIME,
  MAX_VOICE_SECONDS,
} from "@/lib/validation";
import {
  normalizeAudioMime,
  audioExtension,
  parseWaveform,
  serializeWaveform,
  formatSeconds,
} from "@/lib/voice";
import { transcribeVoiceNote } from "@/lib/transcription";
import { isTaskStatus, isTaskLinkType, isAdminRole, isTaskType } from "@/lib/enums";
import { canEditTaskContent, taskVisibility } from "@/lib/task-access";
import { applyAutomations } from "@/lib/automation-run";
import { dispatchWebhookEvent } from "@/lib/webhooks-dispatch";
import type { TaskStatus, TaskLinkType, TaskType } from "@/lib/enums";
import { parentTypeAllowed, wouldCreateCycle } from "@/lib/hierarchy";
import { clampProgress, progressFromSubtasks, runningHours } from "@/lib/tasks";
import { notify, notifyMany } from "@/lib/notifications";
import { parseMentions, type NotificationEvent } from "@/lib/notifications-core";
import {
  isBlockedByLinks,
  normalizeDependencyEdge,
  wouldCreateDependencyCycle,
  type DirectedLink,
} from "@/lib/task-links";
import { trackServerEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import {
  buildRule,
  nextOccurrence,
  WEEKDAYS,
  type RecurrencePreset,
} from "@/lib/recurrence";
import { isValidCron, nextCronOccurrence } from "@/lib/cron";
import { DEFAULT_RECUR_TZ } from "@/lib/recurring-config";
import type { TKey } from "@/lib/i18n";

/** Notify a task's watchers (assignee + creator), skipping the actor. */
async function notifyWatchers(
  task: { id: string; tenantId: string; assignedToUserId: string | null; createdByUserId: string; title: string },
  actorUserId: string,
  type: NotificationEvent,
  titleKey: TKey,
  body?: string
): Promise<void> {
  const ids = [task.assignedToUserId, task.createdByUserId].filter(
    (x): x is string => Boolean(x)
  );
  await notifyMany(ids, {
    tenantId: task.tenantId,
    type,
    titleKey,
    body,
    url: `/tasks/${task.id}`,
    taskId: task.id,
    actorUserId,
  });
}

/** Append an activity-log entry (best-effort; never blocks the mutation). */
async function logActivity(
  taskId: string,
  userId: string,
  type: string,
  detail?: string | null
): Promise<void> {
  await prisma.activityLog
    .create({ data: { taskId, userId, type, detail: detail ?? null } })
    .catch(() => {});
}

/**
 * #35 — tell every tenant admin about a change a NON-admin user made to a task.
 * No-op for admin actors (they don't need to watch each other). Best-effort.
 */
async function notifyAdminsOfChange(
  actor: { id: string; role: string; name: string },
  task: { id: string; tenantId: string; title: string },
  detail: string
): Promise<void> {
  if (isAdminRole(actor.role)) return;
  const admins = await prisma.user.findMany({
    where: { tenantId: task.tenantId, role: { in: ["Admin", "BackendAdmin", "SuperAdmin"] } },
    select: { id: true },
  });
  await notifyMany(
    admins.map((a) => a.id),
    {
      tenantId: task.tenantId,
      type: "admin_activity",
      title: `${actor.name}: ${task.title}`,
      body: detail,
      url: `/tasks/${task.id}`,
      taskId: task.id,
      actorUserId: actor.id,
    }
  );
}

/**
 * #13 — make TaskAssignee reflect exactly `ids` (the full assignee set, primary
 * included). Removes dropped assignees, adds new ones. Idempotent.
 */
async function syncAssignees(taskId: string, ids: (string | null | undefined)[]): Promise<void> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  await prisma.taskAssignee.deleteMany({
    where: { taskId, userId: { notIn: unique.length ? unique : ["__none__"] } },
  });
  for (const userId of unique) {
    await prisma.taskAssignee
      .upsert({
        where: { taskId_userId: { taskId, userId } },
        create: { taskId, userId },
        update: {},
      })
      .catch(() => {});
  }
}

/** Parse the additional-assignee ids from the form (checkbox list, #13). */
function additionalAssigneeIds(formData: FormData): string[] {
  return formData.getAll("assigneeIds").map((v) => v.toString()).filter(Boolean);
}

/**
 * True when an open blocker prevents completing this task. Bidirectional:
 * an outgoing "DependsOn" and an incoming "Blocks" mean the same thing.
 */
async function isTaskBlocked(taskId: string): Promise<boolean> {
  const [deps, blockedBy] = await Promise.all([
    prisma.taskLink.findMany({
      where: { taskId, type: "DependsOn" },
      include: { linkedTask: { select: { status: true } } },
    }),
    prisma.taskLink.findMany({
      where: { linkedTaskId: taskId, type: "Blocks" },
      include: { task: { select: { status: true } } },
    }),
  ]);
  const links: DirectedLink[] = [
    ...deps.map((d) => ({
      type: d.type as TaskLinkType,
      direction: "out" as const,
      linkedStatus: d.linkedTask.status as TaskStatus,
    })),
    ...blockedBy.map((d) => ({
      type: d.type as TaskLinkType,
      direction: "in" as const,
      linkedStatus: d.task.status as TaskStatus,
    })),
  ];
  return isBlockedByLinks(links);
}

export type RecurrenceFields = {
  recurringRule: string | null;
  recurringCron: string | null;
  recurringTz: string | null;
  recurringNextAt: Date | null;
  recurringUntil: Date | null;
  recurringEndCount: number | null;
};

const NO_RECURRENCE: RecurrenceFields = {
  recurringRule: null,
  recurringCron: null,
  recurringTz: null,
  recurringNextAt: null,
  recurringUntil: null,
  recurringEndCount: null,
};

/**
 * Resolve the full recurrence configuration from the task form:
 *   recurrence    none | daily | weekly | monthly | custom
 *   recurInterval every N days/weeks/months (presets)
 *   recurWeekday  MO,TU,… checkboxes (weekly)
 *   recurCron     5-field cron expression (custom)
 *   recurTz       IANA zone anchoring cron/preset
 *   recurEndType  never | count | until
 *   recurEndCount stop after N spawns
 *   recurUntil    stop after this date (yyyy-MM-dd, inclusive to end of day)
 *
 * The first recurringNextAt is the next occurrence after `dueDate` (presets)
 * or after now (cron). Invalid/empty schedules collapse to "no recurrence".
 */
function recurrenceFromForm(
  formData: FormData,
  dueDate: Date | null,
  now: Date = new Date()
): RecurrenceFields {
  const preset = (formData.get("recurrence")?.toString() ?? "none") as
    | RecurrencePreset
    | "custom";
  if (preset === "none") return NO_RECURRENCE;

  const tz = (formData.get("recurTz")?.toString() || DEFAULT_RECUR_TZ).trim();

  // End condition (never / after N spawns / until a date).
  const endType = formData.get("recurEndType")?.toString() ?? "never";
  let recurringEndCount: number | null = null;
  let recurringUntil: Date | null = null;
  if (endType === "count") {
    const n = parseInt(formData.get("recurEndCount")?.toString() ?? "", 10);
    recurringEndCount = Number.isFinite(n) && n > 0 ? n : null;
  } else if (endType === "until") {
    const raw = formData.get("recurUntil")?.toString();
    if (raw) {
      const d = new Date(`${raw}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) recurringUntil = d;
    }
  }

  if (preset === "custom") {
    const cron = formData.get("recurCron")?.toString().trim() ?? "";
    if (!cron || !isValidCron(cron)) return NO_RECURRENCE;
    const recurringNextAt = nextCronOccurrence(cron, now, tz);
    if (!recurringNextAt) return NO_RECURRENCE;
    return {
      recurringRule: null,
      recurringCron: cron,
      recurringTz: tz,
      recurringNextAt,
      recurringUntil,
      recurringEndCount,
    };
  }

  // Preset (daily / weekly / monthly) with interval + optional weekdays.
  const interval = parseInt(formData.get("recurInterval")?.toString() ?? "1", 10);
  const byday = formData
    .getAll("recurWeekday")
    .map((v) => v.toString())
    .filter((v) => (WEEKDAYS as readonly string[]).includes(v));
  const recurringRule = buildRule(preset, interval, byday);
  if (!recurringRule) return NO_RECURRENCE;
  const recurringNextAt = nextOccurrence(recurringRule, dueDate ?? now);
  return {
    recurringRule,
    recurringCron: null,
    recurringTz: tz,
    recurringNextAt,
    recurringUntil,
    recurringEndCount,
  };
}

/** Resolve hierarchy fields from the form, validating parent type + no cycles. */
async function hierarchyFromForm(
  formData: FormData,
  tenantId: string,
  selfId?: string
): Promise<{ type: string; parentId: string | null; storyPoints: number | null }> {
  const typeRaw = formData.get("type")?.toString() ?? "Task";
  const type = (isTaskType(typeRaw) ? typeRaw : "Task") as TaskType;
  const spRaw = formData.get("storyPoints")?.toString() ?? "";
  const storyPoints = spRaw ? Math.max(0, parseInt(spRaw, 10) || 0) : null;

  let parentId = formData.get("parentId")?.toString() || null;
  if (parentId) {
    const parent = await prisma.task.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true, type: true },
    });
    if (!parent || !parentTypeAllowed(type, parent.type as TaskType)) {
      parentId = null;
    } else if (selfId) {
      const all = await prisma.task.findMany({ where: { tenantId }, select: { id: true, parentId: true } });
      const map = new Map(all.map((t) => [t.id, t.parentId]));
      if (wouldCreateCycle(selfId, parentId, map)) parentId = null;
    }
  }
  return { type, parentId, storyPoints };
}

function revalidateTaskViews(taskId?: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/admin/tasks");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

/** Recompute a task's progress from its subtasks (no-op when none exist). */
async function recomputeTaskProgress(taskId: string): Promise<void> {
  const subs = await prisma.subtask.findMany({ where: { taskId } });
  if (subs.length === 0) return;
  const done = subs.filter((s) => s.done).length;
  await prisma.task.update({
    where: { id: taskId },
    data: { progress: progressFromSubtasks(done, subs.length) },
  });
}

/**
 * "Act" gate — may this user DO something on the task (status, comment, timer,
 * attachment)? Admins, the creator, and ANY assignee (primary or co-assignee,
 * #13) qualify. Throws NOT_FOUND across tenants, FORBIDDEN otherwise.
 */
async function assertCanEdit(
  taskId: string,
  user: { id: string; role: string },
  tenantId: string
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("NOT_FOUND");
  // Hard tenant isolation: a task from another tenant is invisible.
  if (task.tenantId !== tenantId) throw new Error("NOT_FOUND");
  if (isAdminRole(user.role) || task.createdByUserId === user.id) return task;
  const assignee = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId: user.id } },
    select: { id: true },
  });
  if (!assignee) throw new Error("FORBIDDEN");
  return task;
}

/**
 * "Edit content" gate (#36) — may this user rewrite the task itself (title,
 * description, assignee, due date, priority, story points, subtasks, links,
 * custom fields)? ONLY the creator or an admin. A user working an admin-assigned
 * task passes assertCanEdit but NOT this.
 */
async function assertCanEditContent(
  taskId: string,
  user: { id: string; role: string },
  tenantId: string
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.tenantId !== tenantId) throw new Error("NOT_FOUND");
  if (!canEditTaskContent(user, task)) throw new Error("FORBIDDEN");
  return task;
}

export type TaskFormState = { error?: string; ok?: boolean };

function parseForm(formData: FormData) {
  return taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    status: formData.get("status") ?? "Todo",
    priority: formData.get("priority") ?? "Medium",
    assignedToUserId: formData.get("assignedToUserId") ?? "",
    projectId: formData.get("projectId") ?? "",
    teamId: formData.get("teamId") ?? "",
    dueDate: formData.get("dueDate") ?? "",
    estimatedHours: formData.get("estimatedHours") ?? "",
    spentHours: formData.get("spentHours") ?? "",
  });
}

export async function createTaskAction(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const { user, tenant } = await requireTenant();
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }
  const d = parsed.data;
  // Non-admins may only create tasks assigned to themselves.
  const assignee = isAdminRole(user.role) ? d.assignedToUserId : user.id;
  // #13 — admins may add co-assignees; the primary above is the Hauptkopf.
  const extraAssignees = isAdminRole(user.role) ? additionalAssigneeIds(formData) : [];
  const recur = recurrenceFromForm(formData, d.dueDate);
  const hier = await hierarchyFromForm(formData, tenant.id);

  const task = await prisma.task.create({
    data: {
      title: d.title,
      description: d.description || null,
      status: d.status,
      priority: d.priority,
      type: hier.type,
      parentId: hier.parentId,
      storyPoints: hier.storyPoints,
      assignedToUserId: assignee,
      projectId: d.projectId,
      teamId: d.teamId,
      dueDate: d.dueDate,
      estimatedHours: d.estimatedHours,
      spentHours: d.spentHours,
      ...recur,
      progress: d.status === "Done" ? 100 : 0,
      completedAt: d.status === "Done" ? new Date() : null,
      createdByUserId: user.id,
      tenantId: tenant.id,
    },
  });

  // #13 — record the full assignee set (Hauptkopf + co-assignees).
  await syncAssignees(task.id, [assignee, ...extraAssignees]);

  await logActivity(task.id, user.id, "created");
  await applyAutomations(tenant.id, task.id, { type: "created", projectId: task.projectId });
  trackServerEvent(ANALYTICS_EVENTS.TASK_CREATED, { priority: task.priority, type: task.type });
  await dispatchWebhookEvent({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    event: "task.created",
    data: { id: task.id, title: task.title, status: task.status, priority: task.priority, projectId: task.projectId },
  });

  // Notify every assignee (except the creator) of the new task.
  const notifyIds = [assignee, ...extraAssignees].filter(
    (x): x is string => Boolean(x) && x !== user.id
  );
  if (notifyIds.length) {
    await notifyMany(notifyIds, {
      tenantId: tenant.id,
      type: "assigned",
      titleKey: "notif.t.assignedNew",
      body: d.title,
      url: `/tasks/${task.id}`,
      taskId: task.id,
      actorUserId: user.id,
    });
  }

  revalidatePath("/");
  revalidatePath("/board");
  redirect(`/tasks/${task.id}`);
}

export async function updateTaskAction(
  taskId: string,
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const { user, tenant } = await requireTenant();
  // #36 — only the creator or an admin may rewrite a task's content. A user
  // working an admin-assigned task edits status/comments/timer/attachments via
  // their own controls, never this full form.
  const existing = await assertCanEditContent(taskId, user, tenant.id);
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }
  const d = parsed.data;

  const becameDone = d.status === "Done" && existing.status !== "Done";
  const leftDone = d.status !== "Done" && existing.status === "Done";

  // Dependency guard: can't complete a task with open "DependsOn" blockers.
  if (becameDone && (await isTaskBlocked(taskId))) {
    return { error: "BLOCKED" };
  }

  const subtaskCount = await prisma.subtask.count({ where: { taskId } });
  // Whoever reaches here (creator or admin) may set the primary + co-assignees (#13).
  const assignee = d.assignedToUserId || null;
  const extraAssignees = additionalAssigneeIds(formData);
  const recur = recurrenceFromForm(formData, d.dueDate);
  // Reset the spawn counter + pause flag when the schedule itself changes (a new
  // series starts fresh); keep them when the schedule is unchanged so an edit to
  // title/desc doesn't quietly restart a running series.
  const scheduleChanged =
    (existing.recurringRule ?? null) !== recur.recurringRule ||
    (existing.recurringCron ?? null) !== recur.recurringCron;
  const hier = await hierarchyFromForm(formData, tenant.id, taskId);

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title: d.title,
      description: d.description || null,
      status: d.status,
      priority: d.priority,
      type: hier.type,
      parentId: hier.parentId,
      storyPoints: hier.storyPoints,
      assignedToUserId: assignee,
      projectId: d.projectId,
      teamId: d.teamId,
      dueDate: d.dueDate,
      estimatedHours: d.estimatedHours,
      spentHours: d.spentHours,
      ...recur,
      ...(scheduleChanged ? { recurringCount: 0, recurringPaused: false } : {}),
      ...(becameDone ? { completedAt: new Date() } : {}),
      ...(leftDone ? { completedAt: null } : {}),
      // Mark fully complete when manually set to Done (only when no subtasks drive it)
      ...(becameDone && subtaskCount === 0 ? { progress: 100 } : {}),
    },
  });
  await syncAssignees(taskId, [assignee, ...extraAssignees]);

  // #35 — detect every meaningful field change; log each + tell admins.
  const changes: { type: string; detail: string }[] = [];
  if (existing.title !== d.title) changes.push({ type: "renamed", detail: `„${existing.title}" → „${d.title}"` });
  if ((existing.description ?? "") !== (d.description ?? "")) changes.push({ type: "description", detail: "Beschreibung geändert" });
  if (existing.status !== d.status) changes.push({ type: leftDone ? "reopened" : "status", detail: `Status: ${existing.status} → ${d.status}` });
  if (existing.priority !== d.priority) changes.push({ type: "priority", detail: `Priorität: ${existing.priority} → ${d.priority}` });
  if ((existing.storyPoints ?? null) !== (hier.storyPoints ?? null)) changes.push({ type: "storyPoints", detail: `Story Points: ${existing.storyPoints ?? "—"} → ${hier.storyPoints ?? "—"}` });
  if ((existing.dueDate?.getTime() ?? 0) !== (d.dueDate?.getTime() ?? 0)) changes.push({ type: "due", detail: `Fälligkeit: ${existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : "—"} → ${d.dueDate ? d.dueDate.toISOString().slice(0, 10) : "—"}` });
  if ((existing.assignedToUserId ?? null) !== (assignee ?? null)) changes.push({ type: "assigned", detail: assignee ? "Hauptkopf geändert" : "Nicht mehr zugewiesen" });

  for (const c of changes) await logActivity(taskId, user.id, c.type, c.detail);
  if (changes.length) {
    await notifyAdminsOfChange(user, { id: taskId, tenantId: tenant.id, title: d.title }, changes.map((c) => c.detail).join(" · "));
  }

  // Notifications: newly-assigned people, status change to watchers, blockers freed.
  const newlyAssigned = [assignee, ...extraAssignees].filter(
    (x): x is string => Boolean(x) && x !== existing.assignedToUserId && x !== user.id
  );
  if (newlyAssigned.length) {
    await notifyMany(newlyAssigned, {
      tenantId: tenant.id,
      type: "assigned",
      titleKey: "notif.t.assigned",
      body: d.title,
      url: `/tasks/${taskId}`,
      taskId,
      actorUserId: user.id,
    });
  }
  if (existing.status !== d.status) {
    await notifyWatchers(
      { ...existing, assignedToUserId: assignee, title: d.title },
      user.id,
      "status",
      "notif.t.status",
      `${d.title}: ${existing.status} → ${d.status}`
    );
  }
  if (becameDone) await notifyBlockerResolved(taskId, tenant.id, user.id);

  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

/**
 * Auto-unblock (#deps): when a task is completed, find every task that was
 * waiting on it — via its own "DependsOn" link OR via this task's "Blocks"
 * link — and, if no other open blocker remains, notify the assignee and log
 * the unblock on the dependent task.
 */
async function notifyBlockerResolved(
  blockerTaskId: string,
  tenantId: string,
  actorUserId: string
): Promise<void> {
  const [dependsOnMe, iBlock] = await Promise.all([
    // tasks whose "DependsOn" link points at the just-completed task
    prisma.taskLink.findMany({
      where: { linkedTaskId: blockerTaskId, type: "DependsOn" },
      include: { task: { select: { id: true, title: true, status: true, assignedToUserId: true } } },
    }),
    // tasks the just-completed task "Blocks"
    prisma.taskLink.findMany({
      where: { taskId: blockerTaskId, type: "Blocks" },
      include: { linkedTask: { select: { id: true, title: true, status: true, assignedToUserId: true } } },
    }),
  ]);
  const dependents = new Map<string, { id: string; title: string; status: string; assignedToUserId: string | null }>();
  for (const l of dependsOnMe) dependents.set(l.task.id, l.task);
  for (const l of iBlock) dependents.set(l.linkedTask.id, l.linkedTask);

  for (const dep of dependents.values()) {
    // a finished dependent was not waiting on anything
    if (dep.status === "Done" || dep.status === "Archived") continue;
    // only unblock if the dependent now has no remaining open blockers
    if (await isTaskBlocked(dep.id)) continue;
    await logActivity(dep.id, actorUserId, "unblocked", dep.title);
    if (!dep.assignedToUserId) continue;
    await notify({
      recipientUserId: dep.assignedToUserId,
      tenantId,
      type: "blocker_resolved",
      titleKey: "notif.t.blockerResolved",
      body: dep.title,
      url: `/tasks/${dep.id}`,
      taskId: dep.id,
      actorUserId,
    });
  }
}

/** Used by the Calendar view (drag a task to another day). */
export async function setTaskDueDateAction(
  taskId: string,
  dateStr: string | null
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  await assertCanEditContent(taskId, user, tenant.id); // #36 due date = content
  const dueDate = dateStr ? new Date(dateStr + "T00:00:00Z") : null;
  await prisma.task.update({ where: { id: taskId }, data: { dueDate } });
  revalidateTaskViews(taskId);
  revalidatePath("/views");
  return { ok: true };
}

/**
 * Used by the Gantt view (drag-to-move / drag-to-resize a bar). Sets both the
 * planned `startDate` and `dueDate` from yyyy-mm-dd strings. Rejects an inverted
 * range so a resize can never push the end before the start.
 */
export async function setTaskScheduleAction(
  taskId: string,
  startStr: string,
  endStr: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, tenant } = await requireTenant();
  await assertCanEditContent(taskId, user, tenant.id); // #36 dates = content
  const startDate = new Date(startStr + "T00:00:00Z");
  const dueDate = new Date(endStr + "T00:00:00Z");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime())) {
    return { ok: false, error: "INVALID" };
  }
  if (dueDate.getTime() < startDate.getTime()) {
    return { ok: false, error: "INVALID_RANGE" };
  }
  await prisma.task.update({ where: { id: taskId }, data: { startDate, dueDate } });
  await logActivity(
    taskId,
    user.id,
    "scheduled",
    `Zeitplan: ${startStr} → ${endStr}`
  );
  revalidateTaskViews(taskId);
  revalidatePath("/gantt");
  revalidatePath("/views");
  return { ok: true };
}

/** Used by the Kanban board drag&drop. */
export async function updateTaskStatusAction(
  taskId: string,
  status: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, tenant } = await requireTenant();
  const existing = await assertCanEdit(taskId, user, tenant.id);
  if (!isTaskStatus(status)) return { ok: false };

  const becameDone = status === "Done" && existing.status !== "Done";
  const leftDone = status !== "Done" && existing.status === "Done";

  if (becameDone && (await isTaskBlocked(taskId))) {
    return { ok: false, error: "BLOCKED" };
  }

  const subtaskCount = await prisma.subtask.count({ where: { taskId } });

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status,
      ...(becameDone ? { completedAt: new Date() } : {}),
      ...(leftDone ? { completedAt: null } : {}),
      ...(becameDone && subtaskCount === 0 ? { progress: 100 } : {}),
    },
  });

  await logActivity(taskId, user.id, leftDone ? "reopened" : "status", `${existing.status} → ${status}`);
  await notifyWatchers(existing, user.id, "status", "notif.t.status", `${existing.title}: ${existing.status} → ${status}`);
  await notifyAdminsOfChange(user, existing, `Status: ${existing.status} → ${status}`);
  if (becameDone) await notifyBlockerResolved(taskId, tenant.id, user.id);
  await applyAutomations(tenant.id, taskId, { type: "status_to", value: status, projectId: existing.projectId });
  if (becameDone) trackServerEvent(ANALYTICS_EVENTS.TASK_COMPLETED, { priority: existing.priority });
  if (becameDone) {
    await dispatchWebhookEvent({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      event: "task.completed",
      data: { id: taskId, title: existing.title, status, projectId: existing.projectId },
    });
  }
  revalidateTaskViews(taskId);
  return { ok: true };
}

/** Admin-only: reassign a task's creator (e.g. when the original creator leaves).
 *  Tenant-scoped + audited via the activity log. */
export async function changeCreatorAction(taskId: string, newCreatorId: string): Promise<{ ok: boolean; error?: string }> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { ok: false, error: "FORBIDDEN" };
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { tenantId: true, createdBy: { select: { name: true } } } });
  if (!task || task.tenantId !== tenant.id) return { ok: false, error: "NOT_FOUND" };
  const newCreator = await prisma.user.findFirst({ where: { id: newCreatorId, tenantId: tenant.id }, select: { name: true } });
  if (!newCreator) return { ok: false, error: "BAD_USER" };

  await prisma.task.update({ where: { id: taskId }, data: { createdByUserId: newCreatorId } });
  await logActivity(taskId, user.id, "creator_changed", `${task.createdBy.name} → ${newCreator.name}`);
  revalidateTaskViews(taskId);
  return { ok: true };
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const { user, tenant } = await requireTenant();
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { tenantId: true, createdByUserId: true } });
  if (!task || task.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  // Admins may delete any task; regular users only tasks THEY created (not ones
  // an admin assigned to them). Hard-fail otherwise.
  if (!isAdminRole(user.role) && task.createdByUserId !== user.id) throw new Error("FORBIDDEN");
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/");
  revalidatePath("/board");
  redirect("/");
}

export async function addCommentAction(
  taskId: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const { user, tenant } = await requireTenant();
  await assertCanEdit(taskId, user, tenant.id);
  const parsed = commentSchema.safeParse({ content: formData.get("content") });
  if (!parsed.success) return { error: "INVALID" };

  await prisma.taskComment.create({
    data: { taskId, userId: user.id, content: parsed.data.content },
  });
  await logActivity(taskId, user.id, "comment", parsed.data.content.slice(0, 80));

  // Notify: @mentions (within the tenant) get a mention; watchers get a comment.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, tenantId: true, title: true, assignedToUserId: true, createdByUserId: true },
  });
  if (task) {
    await dispatchWebhookEvent({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      event: "comment.added",
      data: {
        taskId: task.id,
        taskTitle: task.title,
        author: user.name,
        excerpt: parsed.data.content.slice(0, 140),
      },
    });
    const mentionNames = parseMentions(parsed.data.content);
    const mentioned = mentionNames.length
      ? await prisma.user.findMany({
          where: { username: { in: mentionNames }, tenantId: task.tenantId },
          select: { id: true },
        })
      : [];
    const mentionedIds = new Set(mentioned.map((u) => u.id));
    if (mentionedIds.size) {
      await notifyMany([...mentionedIds], {
        tenantId: task.tenantId,
        type: "mention",
        titleKey: "notif.t.mention",
        body: parsed.data.content.slice(0, 140),
        url: `/tasks/${taskId}`,
        taskId,
        actorUserId: user.id,
      });
    }
    // comment to watchers who weren't already mentioned
    const watchers = [task.assignedToUserId, task.createdByUserId].filter(
      (x): x is string => Boolean(x) && !mentionedIds.has(x as string)
    );
    await notifyMany(watchers, {
      tenantId: task.tenantId,
      type: "comment",
      titleKey: "notif.t.comment",
      body: `${task.title}: ${parsed.data.content.slice(0, 120)}`,
      url: `/tasks/${taskId}`,
      taskId,
      actorUserId: user.id,
    });
    await notifyAdminsOfChange(user, task, `Kommentar: ${parsed.data.content.slice(0, 80)}`);
  }

  revalidatePath(`/tasks/${taskId}`);
  return {};
}

/**
 * #12 — mark this task's comment thread as read up to now for the current user.
 * Called when they open the task detail. Best-effort; drives ✓✓ receipts.
 */
export async function markCommentsReadAction(taskId: string): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { tenantId: true } });
  if (!task || task.tenantId !== tenant.id) return { ok: false };
  await prisma.taskCommentRead
    .upsert({
      where: { taskId_userId: { taskId, userId: user.id } },
      create: { taskId, userId: user.id, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    })
    .catch(() => {});
  return { ok: true };
}

export async function uploadAttachmentAction(
  taskId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const { user, tenant } = await requireTenant();
  const task = await assertCanEdit(taskId, user, tenant.id);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "NO_FILE" };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "TOO_LARGE" };
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return { error: "BAD_TYPE" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || "";
  const safeName = `${randomBytes(12).toString("hex")}${ext}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  try {
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, safeName), bytes);
  } catch {
    // e.g. read-only/ephemeral filesystem or missing volume — surface a clear
    // message instead of an unhandled 500 that looks like "nothing happened".
    return { error: "WRITE_FAILED" };
  }

  await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName: file.name,
      filePath: `/uploads/${safeName}`,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });
  await logActivity(taskId, user.id, "attachment", file.name);
  await notifyAdminsOfChange(user, task, `Anhang hinzugefügt: ${file.name}`);

  revalidatePath(`/tasks/${taskId}`);
  return {};
}

/* ------------------------------------------------------------------ */
/* Voice notes                                                         */
/* ------------------------------------------------------------------ */

/**
 * Validate + persist a recorded voice blob (same storage as attachments:
 * public/uploads + DB row). Expects `file`, `durationSec` and `waveform`
 * (JSON int[] 0-100) in the FormData — all produced by <VoiceRecorder>.
 */
async function saveVoiceUpload(formData: FormData): Promise<
  | { error: string }
  | { filePath: string; mimeType: string; sizeBytes: number; durationSec: number; waveform: string }
> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "NO_FILE" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "TOO_LARGE" };
  const mimeType = normalizeAudioMime(file.type);
  if (!ALLOWED_AUDIO_MIME.includes(mimeType)) return { error: "BAD_TYPE" };
  const durationSec = Number(formData.get("durationSec"));
  // +2s grace: the recorder stops itself at the limit, but the final chunk flush
  // can land slightly past it.
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > MAX_VOICE_SECONDS + 2) {
    return { error: "TOO_LONG" };
  }
  // Re-serialize through the parser so only clamped 0-100 ints reach the DB.
  const waveform = serializeWaveform(parseWaveform(String(formData.get("waveform") ?? "")));

  const bytes = Buffer.from(await file.arrayBuffer());
  const safeName = `${randomBytes(12).toString("hex")}${audioExtension(mimeType)}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, safeName), bytes);

  return {
    filePath: `/uploads/${safeName}`,
    mimeType,
    sizeBytes: file.size,
    durationSec: Math.round(durationSec * 10) / 10,
    waveform,
  };
}

/** Voice note attached directly to the task (parallel to file attachments). */
export async function addVoiceNoteAction(
  taskId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const { user, tenant } = await requireTenant();
  const task = await assertCanEdit(taskId, user, tenant.id);

  const saved = await saveVoiceUpload(formData);
  if ("error" in saved) return { error: saved.error };

  const note = await prisma.voiceNote.create({
    data: { taskId, userId: user.id, ...saved },
  });
  await logActivity(taskId, user.id, "voice_note", formatSeconds(saved.durationSec));
  await notifyAdminsOfChange(user, task, `🎤 Sprachnotiz (${formatSeconds(saved.durationSec)})`);
  // Optional Whisper transcription (ENV opt-in) — fire and forget.
  transcribeVoiceNote(note.id).catch(() => {});

  revalidatePath(`/tasks/${taskId}`);
  return {};
}

/** Voice note recorded as a comment — an empty comment row carries the audio. */
export async function addVoiceCommentAction(
  taskId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const { user, tenant } = await requireTenant();
  await assertCanEdit(taskId, user, tenant.id);

  const saved = await saveVoiceUpload(formData);
  if ("error" in saved) return { error: saved.error };

  const comment = await prisma.taskComment.create({
    data: { taskId, userId: user.id, content: "" },
  });
  const note = await prisma.voiceNote.create({
    data: { taskId, commentId: comment.id, userId: user.id, ...saved },
  });
  const fmt = formatSeconds(saved.durationSec);
  await logActivity(taskId, user.id, "comment", `🎤 ${fmt}`);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, tenantId: true, title: true, assignedToUserId: true, createdByUserId: true },
  });
  if (task) {
    const watchers = [task.assignedToUserId, task.createdByUserId].filter(
      (x): x is string => Boolean(x)
    );
    await notifyMany(watchers, {
      tenantId: task.tenantId,
      type: "comment",
      titleKey: "notif.t.comment",
      body: `${task.title}: 🎤 Sprachnotiz (${fmt})`,
      url: `/tasks/${taskId}`,
      taskId,
      actorUserId: user.id,
    });
    await notifyAdminsOfChange(user, task, `🎤 Sprachnotiz (${fmt})`);
  }
  transcribeVoiceNote(note.id).catch(() => {});

  revalidatePath(`/tasks/${taskId}`);
  return {};
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

/** Manual progress update (ignored when the task has subtasks). */
export async function updateTaskProgressAction(
  taskId: string,
  progress: number
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  await assertCanEditContent(taskId, user, tenant.id); // #36 progress = content

  const parsed = progressSchema.safeParse({ progress });
  if (!parsed.success) return { ok: false };

  const subtaskCount = await prisma.subtask.count({ where: { taskId } });
  if (subtaskCount > 0) return { ok: false }; // subtasks drive progress

  const value = clampProgress(parsed.data.progress);
  await prisma.task.update({
    where: { id: taskId },
    data: { progress: value },
  });

  revalidateTaskViews(taskId);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Subtasks                                                           */
/* ------------------------------------------------------------------ */

export async function addSubtaskAction(
  taskId: string,
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const { user, tenant } = await requireTenant();
  await assertCanEditContent(taskId, user, tenant.id); // #36 subtasks = content

  const parsed = subtaskSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) return { error: "INVALID" };

  const max = await prisma.subtask.aggregate({
    where: { taskId },
    _max: { order: true },
  });

  await prisma.subtask.create({
    data: {
      taskId,
      title: parsed.data.title,
      order: (max._max.order ?? -1) + 1,
    },
  });

  await recomputeTaskProgress(taskId);
  revalidateTaskViews(taskId);
  return {};
}

export async function toggleSubtaskAction(
  subtaskId: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const sub = await prisma.subtask.findUnique({ where: { id: subtaskId } });
  if (!sub) return { ok: false };
  await assertCanEditContent(sub.taskId, user, tenant.id); // #36 subtasks = content

  await prisma.subtask.update({
    where: { id: subtaskId },
    data: { done: !sub.done },
  });

  await recomputeTaskProgress(sub.taskId);
  revalidateTaskViews(sub.taskId);
  return { ok: true };
}

export async function deleteSubtaskAction(
  subtaskId: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const sub = await prisma.subtask.findUnique({ where: { id: subtaskId } });
  if (!sub) return { ok: false };
  await assertCanEditContent(sub.taskId, user, tenant.id); // #36 subtasks = content

  await prisma.subtask.delete({ where: { id: subtaskId } });
  await recomputeTaskProgress(sub.taskId);
  revalidateTaskViews(sub.taskId);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Time tracking — start / stop timer                                 */
/* ------------------------------------------------------------------ */

export async function startTimerAction(
  taskId: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const task = await assertCanEdit(taskId, user, tenant.id);
  if (task.timerStartedAt) return { ok: true }; // already running

  await prisma.task.update({
    where: { id: taskId },
    data: { timerStartedAt: new Date() },
  });
  await logActivity(taskId, user.id, "timer", "Timer gestartet");
  await notifyAdminsOfChange(user, task, "Timer gestartet");
  revalidateTaskViews(taskId);
  return { ok: true };
}

export async function stopTimerAction(
  taskId: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const task = await assertCanEdit(taskId, user, tenant.id);
  if (!task.timerStartedAt) return { ok: true };

  const elapsed = runningHours(task.timerStartedAt);
  await prisma.task.update({
    where: { id: taskId },
    data: {
      spentHours: Math.round((task.spentHours + elapsed) * 100) / 100,
      timerStartedAt: null,
    },
  });
  await logActivity(taskId, user.id, "timer", "Timer gestoppt");
  await notifyAdminsOfChange(user, task, "Timer gestoppt");
  revalidateTaskViews(taskId);
  return { ok: true };
}

/** G+T shortcut: the visible task whose timer is currently running.
 *  Prefers the caller's own assigned task when several timers run. */
export async function findRunningTimerTaskAction(): Promise<{ id: string } | null> {
  const { user, tenant } = await requireTenant();
  const base = await taskVisibility(user, tenant.id);
  const running = await prisma.task.findMany({
    where: { ...base, timerStartedAt: { not: null } },
    select: { id: true, assignedToUserId: true, timerStartedAt: true },
    orderBy: { timerStartedAt: "desc" },
    take: 10,
  });
  if (running.length === 0) return null;
  const own = running.find((r) => r.assignedToUserId === user.id);
  return { id: (own ?? running[0]).id };
}

/* ------------------------------------------------------------------ */
/* Task links / dependencies                                          */
/* ------------------------------------------------------------------ */

export async function addTaskLinkAction(
  taskId: string,
  linkedTaskId: string,
  type: string
): Promise<{ ok: boolean; error?: string }> {
  const { user, tenant } = await requireTenant();
  if (!isTaskLinkType(type)) return { ok: false, error: "TYPE" };
  if (!linkedTaskId || linkedTaskId === taskId) {
    return { ok: false, error: "SELF" };
  }
  const source = await prisma.task.findUnique({ where: { id: taskId }, select: { tenantId: true, createdByUserId: true } });
  const target = await prisma.task.findUnique({ where: { id: linkedTaskId }, select: { tenantId: true, createdByUserId: true } });
  if (!source || source.tenantId !== tenant.id || !target || target.tenantId !== tenant.id) {
    return { ok: false, error: "NOT_FOUND" };
  }
  // Linking is admin-only, EXCEPT a user may link two of their OWN tasks.
  const canLink = isAdminRole(user.role) || (source.createdByUserId === user.id && target.createdByUserId === user.id);
  if (!canLink) return { ok: false, error: "FORBIDDEN" };

  // Cycle guard: a DependsOn/Blocks link must not close a dependency loop
  // (A→B→…→A). Both types are normalized into "X waits for Y" edges.
  const newEdge = normalizeDependencyEdge(taskId, linkedTaskId, type);
  if (newEdge) {
    const existing = await prisma.taskLink.findMany({
      where: {
        type: { in: ["DependsOn", "Blocks"] },
        task: { tenantId: tenant.id },
      },
      select: { taskId: true, linkedTaskId: true, type: true },
    });
    const edges = existing
      .map((l) => normalizeDependencyEdge(l.taskId, l.linkedTaskId, l.type))
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (wouldCreateDependencyCycle(edges, newEdge)) {
      return { ok: false, error: "CYCLE" };
    }
  }

  await prisma.taskLink
    .create({ data: { taskId, linkedTaskId, type } })
    .catch(() => {}); // ignore duplicate (unique constraint)

  revalidateTaskViews(taskId);
  revalidatePath(`/tasks/${linkedTaskId}`); // the other end shows the link too
  return { ok: true };
}

export async function removeTaskLinkAction(
  linkId: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const link = await prisma.taskLink.findUnique({ where: { id: linkId }, include: { task: { select: { tenantId: true, createdByUserId: true } } } });
  if (!link || link.task.tenantId !== tenant.id) return { ok: false };
  if (!isAdminRole(user.role) && link.task.createdByUserId !== user.id) return { ok: false };
  await prisma.taskLink.delete({ where: { id: linkId } });
  revalidateTaskViews(link.taskId);
  revalidatePath(`/tasks/${link.linkedTaskId}`);
  return { ok: true };
}
