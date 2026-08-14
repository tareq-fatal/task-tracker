import "server-only";
import { prisma } from "./prisma";
import { canSeeTask, type TaskInvolvement } from "./task-access";
import { parseMentions } from "./notifications-core";
import { notifyMany } from "./notifications";

export type MentionCandidate = {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
};

/**
 * Mentions are gated on task visibility on purpose: a mention pushes the task
 * TITLE into the recipient's push/Telegram message and links to `/tasks/{id}`.
 * Notifying someone who may not open that task would leak the title and hand
 * them a dead link — exactly what the 2026-07-27 visibility hardening rules
 * out. `canSeeTask` is the single source of truth for that decision.
 */

/** Load the task's involvement shape once — used by both the picker and the
 *  notification path so they can never drift apart. */
async function loadMentionableTask(
  taskId: string,
  tenantId: string
): Promise<(TaskInvolvement & { id: string; title: string }) | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      tenantId: true,
      deletedAt: true,
      createdByUserId: true,
      assignedToUserId: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task || task.tenantId !== tenantId || task.deletedAt) return null;
  return {
    id: task.id,
    title: task.title,
    createdByUserId: task.createdByUserId,
    assignedToUserId: task.assignedToUserId,
    assigneeIds: task.assignees.map((a) => a.userId),
  };
}

/**
 * Everyone in the tenant who may see this task — the @-picker's list AND the
 * allow-list for mention notifications. Deactivated accounts are left out;
 * the caller (the author) is filtered by the UI, not here, so the same list
 * can be reused server-side for validation.
 */
export async function mentionCandidates(
  taskId: string,
  tenantId: string
): Promise<MentionCandidate[]> {
  const task = await loadMentionableTask(taskId, tenantId);
  if (!task) return [];

  const users = await prisma.user.findMany({
    where: { tenantId, deactivatedAt: null },
    select: { id: true, name: true, username: true, avatar: true, role: true },
    orderBy: { name: "asc" },
  });

  return users
    .filter((u) => canSeeTask(u, task))
    .map((u) => ({ id: u.id, name: u.name, username: u.username, avatar: u.avatar }));
}

/**
 * Resolve @mentions in a comment and fire the "mention" notification — in-app,
 * web push, Telegram, email and native, each per the recipient's own channel
 * preferences (see `notify`). Recipients who may not see the task are dropped.
 *
 * @returns the notified user ids, so the caller can leave them out of the
 *          broader "comment" notification (one ping per person, not two).
 */
export async function notifyMentions(input: {
  content: string;
  taskId: string;
  taskTitle: string;
  tenantId: string;
  actor: { id: string; name: string };
}): Promise<Set<string>> {
  const usernames = parseMentions(input.content);
  if (usernames.length === 0) return new Set();

  const task = await loadMentionableTask(input.taskId, input.tenantId);
  if (!task) return new Set();

  const mentioned = await prisma.user.findMany({
    where: {
      username: { in: usernames },
      tenantId: input.tenantId,
      deactivatedAt: null,
    },
    select: { id: true, role: true },
  });

  const ids = mentioned
    .filter((u) => u.id !== input.actor.id && canSeeTask(u, task))
    .map((u) => u.id);
  if (ids.length === 0) return new Set();

  await notifyMany(ids, {
    tenantId: input.tenantId,
    type: "mention",
    titleKey: "notif.t.mention",
    body: `«${input.taskTitle}»\n👤 ${input.actor.name}: ${input.content.slice(0, 60)}`,
    url: `/tasks/${input.taskId}`,
    taskId: input.taskId,
    actorUserId: input.actor.id,
  });

  return new Set(ids);
}
