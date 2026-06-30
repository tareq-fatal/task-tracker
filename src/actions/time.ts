"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { elapsedMinutes, parseDurationToMinutes } from "@/lib/time-tracking";

async function taskInTenant(taskId: string, tenantId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, tenantId }, select: { id: true } });
  if (!task) throw new Error("NOT_FOUND");
}

async function bumpSpentHours(taskId: string, deltaMinutes: number) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { spentHours: true } });
  if (!task) return;
  const next = Math.max(0, Math.round((task.spentHours + deltaMinutes / 60) * 100) / 100);
  await prisma.task.update({ where: { id: taskId }, data: { spentHours: next } });
}

export type RunningEntry = { id: string; taskId: string; taskTitle: string; startedAt: string } | null;

export async function getRunningEntry(): Promise<RunningEntry> {
  const { user } = await requireTenant();
  const e = await prisma.taskTimeEntry.findFirst({
    where: { userId: user.id, endedAt: null },
    include: { task: { select: { title: true } } },
    orderBy: { startedAt: "desc" },
  });
  return e ? { id: e.id, taskId: e.taskId, taskTitle: e.task.title, startedAt: e.startedAt.toISOString() } : null;
}

export async function startTimerAction(taskId: string): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  await taskInTenant(taskId, tenant.id);
  // stop any other running entry for this user first (one timer at a time)
  await stopTimerAction();
  await prisma.taskTimeEntry.create({
    data: { taskId, userId: user.id, tenantId: tenant.id, startedAt: new Date(), endedAt: null },
  });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopTimerAction(): Promise<{ ok: boolean; minutes?: number }> {
  const { user } = await requireTenant();
  const running = await prisma.taskTimeEntry.findFirst({ where: { userId: user.id, endedAt: null } });
  if (!running) return { ok: true };
  const now = new Date();
  const minutes = elapsedMinutes(running.startedAt, now);
  await prisma.taskTimeEntry.update({ where: { id: running.id }, data: { endedAt: now, minutes } });
  await bumpSpentHours(running.taskId, minutes);
  revalidatePath(`/tasks/${running.taskId}`);
  revalidatePath("/", "layout");
  return { ok: true, minutes };
}

export type TimeActionState = { ok?: boolean; error?: string };

export async function addManualTimeAction(
  taskId: string,
  _prev: TimeActionState,
  formData: FormData
): Promise<TimeActionState> {
  const { user, tenant } = await requireTenant();
  await taskInTenant(taskId, tenant.id);
  const minutes = parseDurationToMinutes(formData.get("duration")?.toString() ?? "");
  if (!minutes || minutes <= 0) return { error: "DURATION" };
  const note = formData.get("note")?.toString().trim() || null;
  const now = new Date();
  await prisma.taskTimeEntry.create({
    data: {
      taskId,
      userId: user.id,
      tenantId: tenant.id,
      startedAt: new Date(now.getTime() - minutes * 60000),
      endedAt: now,
      minutes,
      note,
    },
  });
  await bumpSpentHours(taskId, minutes);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function deleteTimeEntryAction(id: string): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const entry = await prisma.taskTimeEntry.findFirst({ where: { id, tenantId: tenant.id } });
  if (!entry) return { ok: false };
  if (entry.userId !== user.id && !isAdminRole(user.role)) return { ok: false };
  await prisma.taskTimeEntry.delete({ where: { id } });
  if (entry.endedAt) await bumpSpentHours(entry.taskId, -entry.minutes);
  revalidatePath(`/tasks/${entry.taskId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}
