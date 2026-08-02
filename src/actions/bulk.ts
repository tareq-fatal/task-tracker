"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, isTaskStatus } from "@/lib/enums";
import { can } from "@/lib/roles";

export type BulkResult = { ok: boolean; count: number; error?: string };

/** Tasks (of the given ids) the current user is allowed to edit, tenant-scoped. */
async function editableIds(ids: string[], user: { id: string; role: string }, tenantId: string): Promise<string[]> {
  if (ids.length === 0) return [];
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, createdByUserId: true, assignedToUserId: true },
  });
  const admin = isAdminRole(user.role);
  return tasks.filter((t) => admin || t.createdByUserId === user.id || t.assignedToUserId === user.id).map((t) => t.id);
}

export async function bulkSetStatusAction(ids: string[], status: string): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  if (!isTaskStatus(status)) return { ok: false, count: 0, error: "BAD_STATUS" };
  const allowed = await editableIds(ids, user, tenant.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };

  const becameDone = status === "Done";
  await prisma.task.updateMany({
    where: { id: { in: allowed }, tenantId: tenant.id },
    data: { status, ...(becameDone ? { completedAt: new Date() } : { completedAt: null }) },
  });
  revalidatePath("/list");
  revalidatePath("/board");
  return { ok: true, count: allowed.length };
}

export async function bulkDeleteAction(ids: string[]): Promise<BulkResult> {
  const { user, tenant } = await requireTenant();
  // Kundenwunsch 2026-08-02: deletion is ADMIN-ONLY. This used to be open to
  // creators AND assignees — and it hard-deleted. Both fixed here.
  if (!can(user.role, "deleteContent")) return { ok: false, count: 0, error: "FORBIDDEN" };
  if (ids.length === 0) return { ok: false, count: 0, error: "NONE" };
  // SOFT delete — aligned with deleteTaskAction: rows (with comments,
  // attachments, subtasks) stay intact and an admin can restore each task.
  const res = await prisma.task.updateMany({
    where: { id: { in: ids }, tenantId: tenant.id, deletedAt: null },
    data: { deletedAt: new Date(), deletedBy: user.id },
  });
  if (res.count === 0) return { ok: false, count: 0, error: "NONE" };
  revalidatePath("/list");
  revalidatePath("/board");
  return { ok: true, count: res.count };
}
