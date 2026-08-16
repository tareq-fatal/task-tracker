import { prisma } from "./prisma";
import { isTaskStatus, isTaskPriority } from "./enums";
import { matchingActions, type AutoEvent } from "./automation";
import { notifyMany } from "./notifications";

/**
 * Apply enabled automation rules for a task after an event. Single pass:
 * actions are applied directly and never re-trigger rules (matchingActions
 * also drops no-ops), so this is loop-free. Best-effort — never throws into
 * the caller's mutation.
 */
export async function applyAutomations(
  tenantId: string,
  taskId: string,
  event: AutoEvent,
  /**
   * `keepAssignee` lässt die `assign_to`-Aktion aus. Wer beim selben Vorgang
   * ausdrücklich jemanden einträgt, meint das auch — die Regel ist die
   * Voreinstellung für den Normalfall, kein Veto gegen eine Absicht.
   */
  opts: { keepAssignee?: boolean } = {}
): Promise<void> {
  try {
    const rules = await prisma.automationRule.findMany({ where: { tenantId, enabled: true } });
    const actions = matchingActions(rules, event);
    if (actions.length === 0) return;

    const data: Record<string, unknown> = {};
    let assignTo: string | null = null;
    for (const a of actions) {
      if (a.type === "set_status" && isTaskStatus(a.value)) {
        data.status = a.value;
        if (a.value === "Done") data.completedAt = new Date();
      }
      if (a.type === "set_priority" && isTaskPriority(a.value)) {
        data.priority = a.value;
      }
      if (a.type === "assign_to" && !opts.keepAssignee) assignTo = a.value;
    }

    // `assign_to` trägt einen BENUTZERNAMEN, keine id: eine Regel soll lesbar
    // bleiben und beim Umziehen der Datenbank nicht ins Leere zeigen. Der Name
    // wird im eigenen Mandanten aufgelöst — nie darüber hinaus.
    let assigneeId: string | null = null;
    if (assignTo) {
      const user = await prisma.user.findFirst({
        where: { tenantId, deactivatedAt: null, username: assignTo.toLowerCase() },
        select: { id: true },
      });
      if (user) assigneeId = user.id;
      else console.warn(`[automation] Regel zeigt auf unbekannten Benutzer "${assignTo}"`);
    }

    const before = assigneeId
      ? await prisma.task.findUnique({
          where: { id: taskId },
          select: { assignedToUserId: true, title: true },
        })
      : null;
    if (assigneeId && before && before.assignedToUserId !== assigneeId) {
      data.assignedToUserId = assigneeId;
    }

    if (Object.keys(data).length > 0) {
      await prisma.task.update({ where: { id: taskId }, data });
    }

    // Ein Zuständigkeitswechsel, den niemand mitbekommt, ist keiner.
    if (data.assignedToUserId && before) {
      await prisma.taskAssignee
        .create({ data: { taskId, userId: assigneeId as string } })
        .catch(() => undefined);
      await notifyMany([assigneeId as string], {
        tenantId,
        type: "assigned",
        titleKey: "notif.t.assignedNew",
        body: before.title,
        url: `/tasks/${taskId}`,
        taskId,
      });
    }
  } catch {
    // automation must never break the underlying task action
  }
}
