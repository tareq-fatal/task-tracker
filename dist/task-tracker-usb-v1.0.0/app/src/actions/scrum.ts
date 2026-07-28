"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { isScrumColumn, statusForColumn } from "@/lib/scrum";

/** Move a card into a scrum column (drag&drop); keeps `status` coherent. */
export async function setTaskScrumColumnAction(
  taskId: string,
  column: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  if (!isScrumColumn(column)) return { ok: false };

  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId: tenant.id },
    select: { id: true, status: true, createdByUserId: true, assignedToUserId: true },
  });
  if (!task) return { ok: false };
  const allowed = isAdminRole(user.role) || task.createdByUserId === user.id || task.assignedToUserId === user.id;
  if (!allowed) return { ok: false };

  const status = statusForColumn(column);
  const becameDone = status === "Done" && task.status !== "Done";
  const leftDone = status !== "Done" && task.status === "Done";

  await prisma.task.update({
    where: { id: taskId },
    data: {
      scrumColumn: column,
      status,
      ...(becameDone ? { completedAt: new Date() } : {}),
      ...(leftDone ? { completedAt: null } : {}),
    },
  });

  revalidatePath("/views");
  revalidatePath("/board");
  return { ok: true };
}
