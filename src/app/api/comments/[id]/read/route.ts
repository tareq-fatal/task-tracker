import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/enums";

/**
 * #12 — mark a single comment as read by the current user.
 * Fired by the client's IntersectionObserver when the comment scrolls into view.
 * Idempotent (unique commentId+userId); best-effort, so the observer can fire freely.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const comment = await prisma.taskComment.findUnique({
    where: { id: params.id },
    select: {
      userId: true,
      task: {
        select: {
          tenantId: true,
          createdByUserId: true,
          assignees: { select: { userId: true } },
        },
      },
    },
  });
  if (!comment) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Tenant isolation + visibility: only someone who can see the task can mark
  // its comments read (admin, the task creator, or an assignee).
  const task = comment.task;
  if (task.tenantId !== user.tenantId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const canView =
    isAdminRole(user.role) ||
    task.createdByUserId === user.id ||
    task.assignees.some((a) => a.userId === user.id);
  if (!canView) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Authoring a comment implies reading it — no receipt row needed for yourself.
  if (comment.userId === user.id) return NextResponse.json({ ok: true });

  await prisma.commentRead
    .upsert({
      where: { commentId_userId: { commentId: params.id, userId: user.id } },
      create: { commentId: params.id, userId: user.id },
      update: {}, // first read wins; keep the original readAt
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
