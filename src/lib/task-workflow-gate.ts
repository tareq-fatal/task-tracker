import "server-only";
import { prisma } from "./prisma";
import { isAdminRole } from "./enums";
import { checkStatusChange, type StatusGate } from "./task-workflow-policy";

/**
 * Server half of the workflow gate: loads the task's control flags plus the
 * open-todo count / logged minutes (only when actually needed) and runs the
 * pure policy. Every user-facing status path calls this — kanban drag,
 * status select, bulk toolbar, scrum board, full edit form.
 */
export async function statusGateFor(
  taskId: string,
  userRole: string,
  from: string,
  to: string
): Promise<StatusGate> {
  if (isAdminRole(userRole) || from === to) return { ok: true };

  const t = await prisma.task.findUnique({
    where: { id: taskId },
    select: { allowedTargetColumn: true, requireAllTodosDone: true, requireTimeTracking: true },
  });
  if (!t) return { ok: true }; // NOT_FOUND handled by the caller's own guards

  const needTodos = t.requireAllTodosDone && to === "Done";
  const needTime = t.requireTimeTracking && to === "Done";
  const [openTodos, timeSum] = await Promise.all([
    needTodos ? prisma.subtask.count({ where: { taskId, done: false } }) : Promise.resolve(0),
    needTime
      ? prisma.taskTimeEntry.aggregate({ where: { taskId, endedAt: { not: null } }, _sum: { minutes: true } })
      : Promise.resolve(null),
  ]);

  return checkStatusChange({
    isAdmin: false,
    from,
    to,
    allowedTargetColumn: t.allowedTargetColumn,
    requireAllTodosDone: t.requireAllTodosDone,
    openTodos,
    requireTimeTracking: t.requireTimeTracking,
    loggedMinutes: timeSum?._sum.minutes ?? 0,
  });
}
