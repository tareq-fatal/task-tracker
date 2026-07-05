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
import { canEditTaskContent } from "@/lib/task-access";
import { applyAutomations } from "@/lib/automation-run";
import type { TaskStatus, TaskLinkType, TaskType } from "@/lib/enums";
import { parentTypeAllowed, wouldCreateCycle } from "@/lib/hierarchy";
import { clampProgress, progressFromSubtasks, runningHours } from "@/lib/tasks";
import { notify, notifyMany } from "@/lib/notifications";
import { type NotificationEvent } from "@/lib/notifications-core";
import { sanitizeRichText, htmlToPlainText, extractMentions } from "@/lib/richtext";
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
  const { recurringRule, recurringNextAt } = recurrenceFromForm(formData, d.dueDate);
  const hier = await hierarchyFromForm(formData, tenant.id);

  const task = await prisma.task.create({
    data: {
      title: d.title,
      description: sanitizeRichText(d.description) || null,
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

  // #13 — record the full assignee set (Hauptkopf + co-assignees).
  await syncAssignees(task.id, [assignee, ...extraAssignees]);

  await logActivity(task.id, user.id, "created");
  await applyAutomations(tenant.id, task.id, { type: "created", projectId: task.projectId });

  // Notify every assignee (except the creator) of the new task.
  const notifyIds = [assignee, ...extraAssignees].filter(
    (x): x is string => Boolean(x) && x !== user.id
  );
  if (notifyIds.length) {
    await notifyMany(notifyIds, {
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
  // #36 — only the creator or an admin may rewrite a task's content. A user
  // working an admin-assigned task edits status/comments/timer/attachments via
  // their own controls, never this full form.
  const existing = await assertCanEditContent(taskId, user, tenant.id);
  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "INVALID" };
  }
  const d = parsed.data;
  const description = sanitizeRichText(d.description) || null;

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
  const { recurringRule, recurringNextAt } = recurrenceFromForm(formData, d.dueDate);
  const hier = await hierarchyFromForm(formData, tenant.id, taskId);

  await prisma.task.update({
    where: { id: taskId },
    data: {
      title: d.title,
      description,
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
  await syncAssignees(taskId, [assignee, ...extraAssignees]);

  // #35 — detect every meaningful field change; log each + tell admins.
  const changes: { type: string; detail: string }[] = [];
  if (existing.title !== d.title) changes.push({ type: "renamed", detail: `„${existing.title}" → „${d.title}"` });
  if ((existing.description ?? "") !== (description ?? "")) changes.push({ type: "description", detail: "Beschreibung geändert" });
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
  await assertCanEditContent(taskId, user, tenant.id); // #36 due date = content
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
  await notifyAdminsOfChange(user, existing, `Status: ${existing.status} → ${status}`);
  if (becameDone) await notifyBlockerResolved(taskId, tenant.id, user.id);
  await applyAutomations(tenant.id, taskId, { type: "status_to", value: status, projectId: existing.projectId });
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
  // Editor output is HTML — sanitize before storing; keep a plain-text version
  // for the activity log and notification previews.
  const content = sanitizeRichText(parsed.data.content);
  if (!content) return { error: "INVALID" };
  const plain = htmlToPlainText(content);

  await prisma.taskComment.create({
    data: { taskId, userId: user.id, content },
  });
  await logActivity(taskId, user.id, "comment", plain.slice(0, 80));

  // Notify: @mentions (within the tenant) get a mention; watchers get a comment.
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, tenantId: true, title: true, assignedToUserId: true, createdByUserId: true },
  });
  if (task) {
    const mentionNames = extractMentions(content);
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
        body: plain.slice(0, 140),
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
      body: `${task.title}: ${plain.slice(0, 120)}`,
      url: `/tasks/${taskId}`,
      taskId,
      actorUserId: user.id,
    });
    await notifyAdminsOfChange(user, task, `Kommentar: ${plain.slice(0, 80)}`);
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
  await logActivity(taskId, user.id, "attachment", file.name);
  await notifyAdminsOfChange(user, task, `Anhang hinzugefügt: ${file.name}`);

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
  const link = await prisma.taskLink.findUnique({ where: { id: linkId }, include: { task: { select: { tenantId: true, createdByUserId: true } } } });
  if (!link || link.task.tenantId !== tenant.id) return { ok: false };
  if (!isAdminRole(user.role) && link.task.createdByUserId !== user.id) return { ok: false };
  await prisma.taskLink.delete({ where: { id: linkId } });
  revalidateTaskViews(link.taskId);
  return { ok: true };
}
