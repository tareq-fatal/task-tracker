"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, isStaffRole } from "@/lib/enums";
import {
  isReactionType,
  canDeleteContent,
  canReact,
  REACTION_NOTIFY_WINDOW_MS,
  REACTION_EMOJI,
  type ReactionType,
} from "@/lib/comment-reactions";
import { notify } from "@/lib/notifications";

/** Load a comment + its task and verify the actor may SEE the task
 *  (staff, creator, or any assignee — same rule as the detail page). */
async function assertCommentAccess(commentId: string) {
  const { user, tenant } = await requireTenant();
  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
    include: {
      user: { select: { id: true, name: true } },
      task: {
        select: {
          id: true,
          title: true,
          tenantId: true,
          createdByUserId: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });
  if (!comment || comment.task.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  const canView =
    isStaffRole(user.role) ||
    comment.task.createdByUserId === user.id ||
    comment.task.assignees.some((a) => a.userId === user.id);
  if (!canView) throw new Error("FORBIDDEN");
  return { user, tenant, comment };
}

/** Toggle a reaction on a comment. Everyone who can see the task may react.
 *  Notifies the comment author (push+Telegram via notify), deduped to one
 *  notification per comment per 5 minutes. */
export async function toggleReactionAction(
  commentId: string,
  type: string
): Promise<{ ok: boolean }> {
  if (!isReactionType(type)) return { ok: false };
  const { user, tenant, comment } = await assertCommentAccess(commentId);
  // Customer decision: reacting is Admin/BackendAdmin-only for now.
  if (!canReact(user.role)) throw new Error("FORBIDDEN");

  const existing = await prisma.commentReaction.findUnique({
    where: { commentId_userId_type: { commentId, userId: user.id, type } },
  });
  if (existing) {
    await prisma.commentReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.commentReaction.create({
      data: { commentId, userId: user.id, type },
    });
    // Notify the author — but not for self-reactions, and at most once per
    // comment per window (anti-spam per the order).
    if (comment.userId !== user.id) {
      const recent = await prisma.notification.findFirst({
        where: {
          userId: comment.userId,
          type: "reaction",
          taskId: comment.task.id,
          createdAt: { gt: new Date(Date.now() - REACTION_NOTIFY_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (!recent) {
        await notify({
          recipientUserId: comment.userId,
          tenantId: tenant.id,
          type: "reaction",
          titleKey: "notif.t.reaction",
          body: `«${comment.task.title}»\n${REACTION_EMOJI[type as ReactionType]} ${user.name}`,
          url: `/tasks/${comment.task.id}`,
          taskId: comment.task.id,
          actorUserId: user.id,
        }).catch(() => {});
      }
    }
  }
  revalidatePath(`/tasks/${comment.task.id}`);
  return { ok: true };
}

/** Soft-delete a comment: author or admin (SubAdmin explicitly NOT). */
export async function deleteCommentAction(commentId: string): Promise<{ ok: boolean }> {
  const { user, comment } = await assertCommentAccess(commentId);
  if (!canDeleteContent(user.role)) throw new Error("FORBIDDEN");
  await prisma.taskComment.update({
    where: { id: commentId },
    data: { deletedAt: new Date(), deletedBy: user.id },
  });
  await prisma.activityLog
    .create({
      data: {
        taskId: comment.task.id,
        userId: user.id,
        type: "comment_deleted",
        detail: comment.user.name,
      },
    })
    .catch(() => {});
  revalidatePath(`/tasks/${comment.task.id}`);
  return { ok: true };
}

/** Restore a soft-deleted comment — admin only. */
export async function restoreCommentAction(commentId: string): Promise<{ ok: boolean }> {
  const { user, comment } = await assertCommentAccess(commentId);
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  await prisma.taskComment.update({
    where: { id: commentId },
    data: { deletedAt: null, deletedBy: null },
  });
  revalidatePath(`/tasks/${comment.task.id}`);
  return { ok: true };
}

/** Soft-delete an attachment: uploader (tracked since 2026-07-28) or admin. */
export async function deleteAttachmentAction(attachmentId: string): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const att = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    include: { task: { select: { id: true, tenantId: true } } },
  });
  if (!att || att.task.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  if (!canDeleteContent(user.role)) throw new Error("FORBIDDEN");
  await prisma.taskAttachment.update({
    where: { id: attachmentId },
    data: { deletedAt: new Date(), deletedBy: user.id },
  });
  await prisma.activityLog
    .create({
      data: {
        taskId: att.task.id,
        userId: user.id,
        type: "attachment_deleted",
        detail: att.fileName,
      },
    })
    .catch(() => {});
  revalidatePath(`/tasks/${att.task.id}`);
  return { ok: true };
}
