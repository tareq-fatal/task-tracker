import { prisma } from "./prisma";
import { isTaskStatus, isTaskPriority } from "./enums";
import { matchingActions, type AutoEvent } from "./automation";

/**
 * Apply enabled automation rules for a task after an event. Single pass:
 * actions are applied directly and never re-trigger rules (matchingActions
 * also drops no-ops), so this is loop-free. Best-effort — never throws into
 * the caller's mutation.
 */
export async function applyAutomations(tenantId: string, taskId: string, event: AutoEvent): Promise<void> {
  try {
    const rules = await prisma.automationRule.findMany({ where: { tenantId, enabled: true } });
    const actions = matchingActions(rules, event);
    if (actions.length === 0) return;

    const data: Record<string, unknown> = {};
    for (const a of actions) {
      if (a.type === "set_status" && isTaskStatus(a.value)) {
        data.status = a.value;
        if (a.value === "Done") data.completedAt = new Date();
      }
      if (a.type === "set_priority" && isTaskPriority(a.value)) {
        data.priority = a.value;
      }
    }
    if (Object.keys(data).length > 0) {
      await prisma.task.update({ where: { id: taskId }, data });
    }
  } catch {
    // automation must never break the underlying task action
  }
}
