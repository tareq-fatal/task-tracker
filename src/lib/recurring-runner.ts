import "server-only";
import type { Task } from "@prisma/client";
import { prisma } from "./prisma";
import { notifyMany } from "./notifications";
import { decideDue, type SeriesSchedule } from "./recurring-schedule";

/** Read a task's recurrence columns into the pure SeriesSchedule shape. */
export function seriesOf(t: Task): SeriesSchedule {
  return {
    rule: t.recurringRule,
    cron: t.recurringCron,
    tz: t.recurringTz,
    until: t.recurringUntil,
    endCount: t.recurringEndCount,
    count: t.recurringCount,
    paused: t.recurringPaused,
  };
}

/**
 * Spawn one concrete instance of a recurring template task, due at `dueDate`.
 * The instance carries no recurrence of its own, so it never recurses. It
 * copies the template's content and its full assignee set (#13), and notifies
 * every assignee. Returns the created task.
 */
export async function spawnRecurringInstance(template: Task, dueDate: Date): Promise<Task> {
  const templateAssignees = await prisma.taskAssignee.findMany({
    where: { taskId: template.id },
    select: { userId: true },
  });

  const instance = await prisma.task.create({
    data: {
      title: template.title,
      description: template.description,
      status: "Todo",
      priority: template.priority,
      type: template.type,
      assignedToUserId: template.assignedToUserId,
      projectId: template.projectId,
      teamId: template.teamId,
      dueDate,
      estimatedHours: template.estimatedHours,
      storyPoints: template.storyPoints,
      progress: 0,
      createdByUserId: template.createdByUserId,
      tenantId: template.tenantId,
    },
  });

  // Mirror the template's assignee set onto the instance (primary + co-assignees).
  const assigneeIds = [
    ...new Set(
      [template.assignedToUserId, ...templateAssignees.map((a) => a.userId)].filter(
        (x): x is string => Boolean(x)
      )
    ),
  ];
  if (assigneeIds.length) {
    await prisma.taskAssignee.createMany({
      data: assigneeIds.map((userId) => ({ taskId: instance.id, userId })),
      skipDuplicates: true,
    });
    await notifyMany(assigneeIds, {
      tenantId: template.tenantId,
      type: "recurring",
      title: "Wiederkehrende Aufgabe",
      body: template.title,
      url: `/tasks/${instance.id}`,
      taskId: instance.id,
    });
  }
  return instance;
}

/**
 * Advance a single due series: spawn (if warranted), bump the spawn counter,
 * and write the follow-up occurrence — or clear the recurrence when the series
 * is finished. Returns 1 if an instance was created, else 0.
 */
export async function advanceSeries(template: Task, now: Date): Promise<number> {
  const dueAt = template.recurringNextAt;
  if (!dueAt) return 0;
  const decision = decideDue(seriesOf(template), dueAt, now);

  if (decision.action === "skip") return 0;

  if (decision.action === "finished") {
    await clearRecurrence(template.id);
    return 0;
  }

  // Claim the occurrence BEFORE spawning: the conditional update only matches
  // while recurringNextAt still equals dueAt, so a concurrent second runner
  // (double-scheduled cron, overlapping invocations) sees count === 0 and
  // spawns nothing. decideDue's `now` additionally collapses a backlog into a
  // single spawn. Both paths previously duplicated tasks (Kunden-Report
  // 2026-08, Bug 1).
  const claimed = await prisma.task.updateMany({
    where: { id: template.id, recurringNextAt: dueAt },
    data: decision.next
      ? { recurringNextAt: decision.next, recurringCount: { increment: 1 } }
      : {
          // Last occurrence: count the spawn, then retire the series.
          recurringCount: { increment: 1 },
          recurringRule: null,
          recurringCron: null,
          recurringNextAt: null,
        },
  });
  if (claimed.count === 0) return 0;

  await spawnRecurringInstance(template, dueAt);
  return 1;
}

/** Strip all recurrence from a task, turning the template back into a plain task. */
export async function clearRecurrence(taskId: string): Promise<void> {
  await prisma.task.update({
    where: { id: taskId },
    data: { recurringRule: null, recurringCron: null, recurringNextAt: null },
  });
}

/**
 * Spawn the next instance of every recurring series whose recurringNextAt is
 * due and which isn't paused, advancing each series afterwards. Called from the
 * cron route (see src/app/api/cron/recurring/route.ts). Spawns at most one
 * instance per series per run; missed occurrences are collapsed, not replayed.
 */
export async function runDueRecurring(now = new Date()): Promise<{ created: number; scanned: number }> {
  const due = await prisma.task.findMany({
    where: {
      recurringNextAt: { lte: now },
      recurringPaused: false,
      OR: [{ recurringRule: { not: null } }, { recurringCron: { not: null } }],
    },
  });

  let created = 0;
  for (const t of due) {
    created += await advanceSeries(t, now);
  }
  return { created, scanned: due.length };
}
