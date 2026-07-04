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
} from "@/lib/validation";
import { isTaskStatus, isTaskLinkType, isAdminRole, isTaskType } from "@/lib/enums";
import { applyAutomations } from "@/lib/automation-run";
import type { TaskStatus, TaskLinkType, TaskType } from "@/lib/enums";
import { parentTypeAllowed, wouldCreateCycle } from "@/lib/hierarchy";
import { clampProgress, progressFromSubtasks, runningHours } from "@/lib/tasks";
import { notify, notifyMany } from "@/lib/notifications";
import { parseMentions, type NotificationEvent } from "@/lib/notifications-core";
import { isBlockedByOpenDeps } from "@/lib/task-links";
import {
  presetToRule,
  nextOccurrence,
  type RecurrencePreset,
} from "@/lib/recurrence";

/** Notify a task's watchers (assignee + creator), skipping the actor. */
async function notifyWatchers(
  task: { id: string; tenantId: string; assignedToUserId: string | null; createdByUserId: string; title: string },
  actorUserId: string,
  type: NotificationEvent,
  title: string,
  body?: string
): Promise<void> {
  const ids = [task.assignedToUserId, task.createdByUserId].filter(
    (x): x is string => Boolean(x)
  );
  await notifyMany(ids, {
    tenantId: task.tenantId,
    type,
    title,
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

/** True when an open "DependsOn" blocker prevents completing this task. */
async function isTaskBlocked(taskId: string): Promise<boolean> {
  const deps = await prisma.taskLink.findMany({
    where: { taskId, type: "DependsOn" },
    include: { linkedTask: { select: { status: true } } },
  });
  return isBlockedByOpenDeps(
    deps.map((d) => ({
      type: d.type as TaskLinkType,
      linkedStatus: d.linkedTask.status as TaskStatus,
    }))
  );
}

/** Resolve the recurrence rule + next spawn time from a form's preset field. */
function recurrenceFromForm(
  formData: FormData,
  dueDate: Date | null
): { recurringRule: string | null; recurringNextAt: Date | null } {
  const preset = (formData.get("recurrence")?.toString() ??
    "none") as RecurrencePreset;
  const recurringRule = presetToRule(preset);
  const recurringNextAt = recurringRule
    ? nextOccurrence(recurringRule, dueDate ?? new Date())
    : null;
  return { recurringRule, recurringNextAt };
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

async function assertCanEdit(
  taskId: string,
  user: { id: string; role: string },
  tenantId: string
) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("NOT_FOUND");
  // Hard tenant isolation: a task from another tenant is invisible.
  if (task.tenantId !== tenantId) throw new Error("NOT_FOUND");
  const allowed =
    isAdminRole(user.role) ||
    task.createdByUserId === user.id ||
    task.assignedToUserId === user.id;
  if (!allowed) throw new Error("FORBIDDEN");
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
  const { recurringRule, recurringNextAt } = recurrenceFromForm(formData, d.dueDate);
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
      recurringRule,
      recurringNextAt,
      progress: d.status === "Done" ? 100 : 0,
      completedAt: d.status === "Done" ? new Date() : null,
      createdByUserId: user.id,
      tenantId: tenant.id,
    },
  });

  await logActivity(task.id, user.id, "created");
  await applyAutomations(tenant.id, task.id, { type: "created", projectId: task.projectId });

  if (assignee && assignee !== user.id) {
    await notify({
      recipientUserId: assignee,
      tenantId: tenant.id,
      type: "assigned",
      title: "Neue Aufgabe zugewiesen",
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
  const existing = await assertCanEdit(taskId, user, tenant.id);
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
  // Non-admins cannot reassign tasks — keep the existing assignee.
  const assignee = isAdminRole(user.role)
    ? d.assignedToUserId
    : (existing.assignedToUserId ?? user.id);
  const { recurringRule, recurringNextAt } = recurrenceFromForm(formData, d.dueDate);
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
      recurringRule,
      recurringNextAt,
      ...(becameDone ? { completedAt: new Date() } : {}),
      ...(leftDone ? { completedAt: null } : {}),
      // Mark fully complete when manually set to Done (only when no subtasks drive it)
      ...(becameDone && subtaskCount === 0 ? { progress: 100 } : {}),
    },
  });

  // Activity log: record meaningful field changes.
  if (existing.status !== d.status) {
    await logActivity(taskId, user.id, leftDone ? "reopened" : "status", `${existing.status} → ${d.status}`);
  }
  if ((existing.assignedToUserId ?? null) !== (assignee ?? null)) {
    await logActivity(taskId, user.id, "assigned", assignee ? undefined : "unassigned");
  }
  if (existing.priority !== d.priority) {
    await logActivity(taskId, user.id, "priority", `${existing.priority} → ${d.priority}`);
  }

  // Notifications: newly-assigned person, status change to watchers, blockers freed.
  if (assignee && assignee !== existing.assignedToUserId && assignee !== user.id) {
    await notify({
      recipientUserId: assignee,
      tenantId: tenant.id,
      type: "assigned",
      title: "Aufgabe zugewiesen",
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
      `Status: ${d.title}`,
      `${existing.status} → ${d.status}`
    );
  }
  if (becameDone) await notifyBlockerResolved(taskId, tenant.id, user.id);

  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath(`/tasks/${taskId}`);
  redirect(`/tasks/${taskId}`);
}

/** When a task is completed, tell the assignees of tasks that DependOn it. */
async function notifyBlockerResolved(
  blockerTaskId: string,
  tenantId: string,
  actorUserId: string
): Promise<void> {
  // tasks whose "DependsOn" link points at the just-completed task
  const dependents = await prisma.taskLink.findMany({
    where: { linkedTaskId: blockerTaskId, type: "DependsOn" },
    include: { task: { select: { id: true, title: true, assignedToUserId: true } } },
  });
  for (const link of dependents) {
    const dep = link.task;
    if (!dep.assignedToUserId) continue;
    // only notify if the dependent now has no remaining open blockers
    if (await isTaskBlocked(dep.id)) continue;
    await notify({
      recipientUserId: dep.assignedToUserId,
      tenantId,
      type: "blocker_resolved",
      title: "Blocker erledigt",
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
  await assertCanEdit(taskId, user, tenant.id);
  const dueDate = dateStr ? new Date(dateStr + "T00:00:00Z") : null;
  await prisma.task.update({ where: { id: taskId }, data: { dueDate } });
  revalidateTaskViews(taskId);
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
  await notifyWatchers(existing, user.id, "status", `Status: ${existing.title}`, `${existing.status} → ${status}`);
  if (becameDone) await notifyBlockerResolved(taskId, tenant.id, user.id);
  await applyAutomations(tenant.id, taskId, { type: "status_to", value: status, projectId: existing.projectId });
  revalidateTaskViews(taskId);
  return { ok: true };
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const { user, tenant } = await requireTenant();
  // Only admins (Mandant-Admin / Backend-Admin) may delete. Hard-fail otherwise.
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  // still tenant-scoped: never delete another tenant's task
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { tenantId: true } });
  if (!task || task.tenantId !== tenant.id) throw new Error("NOT_FOUND");
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
  await logActivity(taskId, user.id, "comment");

  // Notify: @mentions (within the tenant) get a mention; watchers get a comment.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, tenantId: true, title: true, assignedToUserId: true, createdByUserId: true },
  });
  if (task) {
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
        title: "Du wurdest erwähnt",
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
      title: "Neuer Kommentar",
      body: `${task.title}: ${parsed.data.content.slice(0, 120)}`,
      url: `/tasks/${taskId}`,
      taskId,
      actorUserId: user.id,
    });
  }

  revalidatePath(`/tasks/${taskId}`);
  return {};
}

export async function uploadAttachmentAction(
  taskId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const { user, tenant } = await requireTenant();
  await assertCanEdit(taskId, user, tenant.id);

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
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, safeName), bytes);

  await prisma.taskAttachment.create({
    data: {
      taskId,
      fileName: file.name,
      filePath: `/uploads/${safeName}`,
      mimeType: file.type,
      sizeBytes: file.size,
    },
  });

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
  await assertCanEdit(taskId, user, tenant.id);

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
  await assertCanEdit(taskId, user, tenant.id);

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
  await assertCanEdit(sub.taskId, user, tenant.id);

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
  await assertCanEdit(sub.taskId, user, tenant.id);

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
  revalidateTaskViews(taskId);
  return { ok: true };
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
  await assertCanEdit(taskId, user, tenant.id);
  if (!isTaskLinkType(type)) return { ok: false, error: "TYPE" };
  if (!linkedTaskId || linkedTaskId === taskId) {
    return { ok: false, error: "SELF" };
  }
  const target = await prisma.task.findUnique({ where: { id: linkedTaskId } });
  if (!target || target.tenantId !== tenant.id) {
    return { ok: false, error: "NOT_FOUND" };
  }

  await prisma.taskLink
    .create({ data: { taskId, linkedTaskId, type } })
    .catch(() => {}); // ignore duplicate (unique constraint)

  revalidateTaskViews(taskId);
  return { ok: true };
}

export async function removeTaskLinkAction(
  linkId: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const link = await prisma.taskLink.findUnique({ where: { id: linkId } });
  if (!link) return { ok: false };
  await assertCanEdit(link.taskId, user, tenant.id);
  await prisma.taskLink.delete({ where: { id: linkId } });
  revalidateTaskViews(link.taskId);
  return { ok: true };
}
