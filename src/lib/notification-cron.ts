import "server-only";
import { prisma } from "./prisma";
import { notify } from "./notifications";

const DAY = 24 * 60 * 60 * 1000;

/** Daily reminders: due within 24h, and overdue. Deduped to once per ~20h. */
export async function runDueReminders(now = new Date()): Promise<{
  dueSoon: number;
  overdue: number;
}> {
  const soon = new Date(now.getTime() + DAY);
  const open = { notIn: ["Done", "Archived"] };

  const dueSoonTasks = await prisma.task.findMany({
    where: { status: open, dueDate: { gte: now, lte: soon }, assignedToUserId: { not: null } },
    select: { id: true, title: true, tenantId: true, assignedToUserId: true },
  });
  const overdueTasks = await prisma.task.findMany({
    where: { status: open, dueDate: { lt: now }, assignedToUserId: { not: null } },
    select: { id: true, title: true, tenantId: true, assignedToUserId: true },
  });

  let dueSoon = 0;
  for (const t of dueSoonTasks) {
    if (await recentlyNotified(t.id, "due_soon", now)) continue;
    await notify({
      recipientUserId: t.assignedToUserId!,
      tenantId: t.tenantId,
      type: "due_soon",
      title: "Bald fällig",
      body: t.title,
      url: `/tasks/${t.id}`,
      taskId: t.id,
    });
    dueSoon++;
  }

  let overdue = 0;
  for (const t of overdueTasks) {
    if (await recentlyNotified(t.id, "overdue", now)) continue;
    await notify({
      recipientUserId: t.assignedToUserId!,
      tenantId: t.tenantId,
      type: "overdue",
      title: "Überfällig",
      body: t.title,
      url: `/tasks/${t.id}`,
      taskId: t.id,
    });
    overdue++;
  }

  return { dueSoon, overdue };
}

async function recentlyNotified(
  taskId: string,
  type: string,
  now: Date
): Promise<boolean> {
  const since = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const n = await prisma.notification.count({
    where: { taskId, type, createdAt: { gte: since } },
  });
  return n > 0;
}
