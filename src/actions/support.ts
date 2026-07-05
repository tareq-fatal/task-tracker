"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { notifyMany } from "@/lib/notifications";

export type SupportState = { ok?: boolean; error?: string };

/** Load an admin + a tenant-scoped task, or throw. Shared guard for support tools. */
async function requireAdminTask(taskId: string) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, tenantId: true, title: true, priority: true, escalatedAt: true },
  });
  if (!task || task.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  return { user, tenant, task };
}

/** Everyone assigned to the task (to notify on a support action). */
async function assigneeIds(taskId: string): Promise<string[]> {
  const rows = await prisma.taskAssignee.findMany({ where: { taskId }, select: { userId: true } });
  return rows.map((r) => r.userId);
}

async function log(taskId: string, userId: string, type: string, detail?: string) {
  await prisma.activityLog.create({ data: { taskId, userId, type, detail: detail ?? null } }).catch(() => {});
}

/**
 * #24 Escalate / de-escalate. Escalating flags the task and bumps it to Critical;
 * de-escalating just clears the flag (keeps the priority). Notifies assignees.
 */
export async function escalateTaskAction(taskId: string, escalate: boolean): Promise<SupportState> {
  const { user, tenant, task } = await requireAdminTask(taskId);
  await prisma.task.update({
    where: { id: taskId },
    data: {
      escalatedAt: escalate ? new Date() : null,
      ...(escalate && task.priority !== "Critical" ? { priority: "Critical" } : {}),
    },
  });
  await log(taskId, user.id, escalate ? "escalated" : "deescalated");
  if (escalate) {
    await notifyMany(await assigneeIds(taskId), {
      tenantId: tenant.id,
      type: "status",
      titleKey: "notifmsg.escalated",
      body: task.title,
      url: `/tasks/${taskId}`,
      taskId,
      actorUserId: user.id,
    });
  }
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/board");
  return { ok: true };
}

/**
 * #24 Assist — the admin joins the task as a co-assignee to help work it,
 * without displacing the Hauptkopf. Idempotent.
 */
export async function assistTaskAction(taskId: string): Promise<SupportState> {
  const { user, task } = await requireAdminTask(taskId);
  await prisma.taskAssignee
    .upsert({
      where: { taskId_userId: { taskId, userId: user.id } },
      create: { taskId, userId: user.id },
      update: {},
    })
    .catch(() => {});
  await log(taskId, user.id, "assist");
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/**
 * #24 Coaching note — a short guidance note from the admin. Stored as a comment
 * (so it lives in the thread) + logged as "coaching" + pushed to the assignees.
 */
export async function coachingNoteAction(taskId: string, note: string): Promise<SupportState> {
  const { user, tenant, task } = await requireAdminTask(taskId);
  const clean = note.trim();
  if (!clean) return { error: "EMPTY" };

  await prisma.taskComment.create({
    data: { taskId, userId: user.id, content: `🎓 ${clean}` },
  });
  await log(taskId, user.id, "coaching", clean.slice(0, 80));
  await notifyMany(await assigneeIds(taskId), {
    tenantId: tenant.id,
    type: "comment",
    titleKey: "notifmsg.coaching",
    body: `${task.title}: ${clean.slice(0, 120)}`,
    url: `/tasks/${taskId}`,
    taskId,
    actorUserId: user.id,
  });
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}
