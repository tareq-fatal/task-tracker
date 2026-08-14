"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { isScrumColumn, statusForColumn } from "@/lib/scrum";
import { statusGateFor } from "@/lib/task-workflow-gate";
import { notifyReviewRequested } from "@/lib/review-notify";

/** Move a card into a scrum column (drag&drop); keeps `status` coherent. */
export async function setTaskScrumColumnAction(
  taskId: string,
  column: string
): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  if (!isScrumColumn(column)) return { ok: false };

  const task = await prisma.task.findFirst({
    where: { id: taskId, tenantId: tenant.id },
    select: {
      id: true,
      title: true,
      status: true,
      scrumColumn: true,
      createdByUserId: true,
      assignedToUserId: true,
    },
  });
  if (!task) return { ok: false };
  const allowed = isAdminRole(user.role) || task.createdByUserId === user.id || task.assignedToUserId === user.id;
  if (!allowed) return { ok: false };

  const status = statusForColumn(column);
  // Admin-Workflow-Kontrolle: Scrum-Spalten mappen auf Status — gleiches Gate.
  const gate = await statusGateFor(taskId, user.role, task.status, status);
  if (!gate.ok) return { ok: false };
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

  // Karte landet in „Zur Prüfung" → die Person, die abnehmen soll, wird
  // benachrichtigt. Gleiche Funktion wie über die Schnittstelle, damit Board
  // und Agent nicht auseinanderlaufen.
  if (column === "to-verify" && task.scrumColumn !== "to-verify") {
    await notifyReviewRequested({
      tenantId: tenant.id,
      taskId,
      taskTitle: task.title,
      assignedToUserId: task.assignedToUserId,
      createdByUserId: task.createdByUserId,
      actor: { id: user.id, name: user.name },
    }).catch(() => undefined);
  }

  revalidatePath("/views");
  revalidatePath("/board");
  return { ok: true };
}
