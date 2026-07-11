"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { canEditTaskContent } from "@/lib/task-access";
import {
  spawnRecurringInstance,
  clearRecurrence,
  seriesOf,
} from "@/lib/recurring-runner";
import { nextFire } from "@/lib/recurring-schedule";

export type RecurringActionState = { error?: string; ok?: boolean };

/**
 * Load a recurring template task and assert the caller (creator or admin) may
 * manage it. Throws NOT_FOUND across tenants, FORBIDDEN otherwise.
 */
async function requireManageableSeries(taskId: string) {
  const { user, tenant } = await requireTenant();
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.tenantId !== tenant.id) throw new Error("NOT_FOUND");
  if (!canEditTaskContent(user, task)) throw new Error("FORBIDDEN");
  return { task, user, tenant };
}

function revalidate(taskId: string) {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/admin/recurring");
}

/** Pause a series — no instances spawn until it's resumed. */
export async function pauseRecurringAction(taskId: string): Promise<RecurringActionState> {
  await requireManageableSeries(taskId);
  await prisma.task.update({ where: { id: taskId }, data: { recurringPaused: true } });
  revalidate(taskId);
  return { ok: true };
}

/** Resume a paused series. */
export async function resumeRecurringAction(taskId: string): Promise<RecurringActionState> {
  await requireManageableSeries(taskId);
  await prisma.task.update({ where: { id: taskId }, data: { recurringPaused: false } });
  revalidate(taskId);
  return { ok: true };
}

/**
 * Skip the next occurrence: advance recurringNextAt to the following fire time
 * without spawning an instance. If there is no following occurrence the series
 * is retired.
 */
export async function skipNextRecurringAction(taskId: string): Promise<RecurringActionState> {
  const { task } = await requireManageableSeries(taskId);
  if (!task.recurringNextAt) return { error: "NOT_RECURRING" };
  const next = nextFire(seriesOf(task), task.recurringNextAt);
  if (next) {
    await prisma.task.update({ where: { id: taskId }, data: { recurringNextAt: next } });
  } else {
    await clearRecurrence(taskId);
  }
  revalidate(taskId);
  return { ok: true };
}

/**
 * Spawn one instance right now (out of band), without disturbing the series'
 * own schedule or counter — useful for "run it once more" ad-hoc needs.
 */
export async function runRecurringNowAction(taskId: string): Promise<RecurringActionState> {
  const { task } = await requireManageableSeries(taskId);
  if (!task.recurringRule && !task.recurringCron) return { error: "NOT_RECURRING" };
  await spawnRecurringInstance(task, new Date());
  revalidate(taskId);
  return { ok: true };
}

/** Stop recurring entirely — the task becomes a plain one-off. */
export async function stopRecurringAction(taskId: string): Promise<RecurringActionState> {
  await requireManageableSeries(taskId);
  await clearRecurrence(taskId);
  revalidate(taskId);
  return { ok: true };
}
