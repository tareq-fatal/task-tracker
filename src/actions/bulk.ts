"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, isTaskStatus } from "@/lib/enums";

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
  const allowed = await editableIds(ids, user, tenant.id);
  if (allowed.length === 0) return { ok: false, count: 0, error: "NONE" };
  // extra tenant guard on the delete itself
  const res = await prisma.task.deleteMany({ where: { id: { in: allowed }, tenantId: tenant.id } });
  revalidatePath("/list");
  revalidatePath("/board");
  return { ok: true, count: res.count };
}
