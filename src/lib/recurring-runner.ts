import "server-only";
import { prisma } from "./prisma";
import { nextOccurrence } from "./recurrence";
import { notify } from "./notifications";

/**
 * Spawn the next instance of every recurring task whose recurringNextAt is due,
 * then advance the template's next occurrence. Spawned instances carry no rule,
 * so they don't recurse themselves.
 */
export async function runDueRecurring(now = new Date()): Promise<{ created: number }> {
  const due = await prisma.task.findMany({
    where: { recurringRule: { not: null }, recurringNextAt: { lte: now } },
  });

  let created = 0;
  for (const t of due) {
    if (!t.recurringRule || !t.recurringNextAt) continue;
    const instance = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        status: "Todo",
        priority: t.priority,
        assignedToUserId: t.assignedToUserId,
        projectId: t.projectId,
        teamId: t.teamId,
        dueDate: t.recurringNextAt,
        estimatedHours: t.estimatedHours,
        progress: 0,
        createdByUserId: t.createdByUserId,
        tenantId: t.tenantId,
      },
    });
    created++;
    if (t.assignedToUserId) {
      await notify({
        recipientUserId: t.assignedToUserId,
        tenantId: t.tenantId,
        type: "recurring",
        titleKey: "notifmsg.recurring",
        body: t.title,
        url: `/tasks/${instance.id}`,
        taskId: instance.id,
      });
    }

    // advance; if the rule can't produce a next date, stop recurring
    const next = nextOccurrence(t.recurringRule, t.recurringNextAt);
    await prisma.task.update({
      where: { id: t.id },
      data: next ? { recurringNextAt: next } : { recurringRule: null, recurringNextAt: null },
    });
  }
  return { created };
}
