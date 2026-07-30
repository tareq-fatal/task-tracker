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
    data: { taskId, userId: user.id, tenantId: tenant.id, startedAt: new Date(), endedAt: null, source: "timer" },
  });
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopTimerAction(): Promise<{ ok: boolean; minutes?: number }> {
  return stopTimerAtAction(null);
}

/**
 * Stop the running timer, optionally at an earlier moment (idle detection passes
 * the last-activity time so unattended minutes are not billed). The end time is
 * clamped to [startedAt, now].
 */
export async function stopTimerAtAction(endedAtIso: string | null): Promise<{ ok: boolean; minutes?: number }> {
  const { user } = await requireTenant();
  const running = await prisma.taskTimeEntry.findFirst({ where: { userId: user.id, endedAt: null } });
  if (!running) return { ok: true };
  const now = new Date();
  let end = now;
  if (endedAtIso) {
    const requested = new Date(endedAtIso);
    if (!Number.isNaN(requested.getTime())) {
      end = new Date(Math.min(now.getTime(), Math.max(running.startedAt.getTime(), requested.getTime())));
    }
  }
  const minutes = elapsedMinutes(running.startedAt, end);
  await prisma.taskTimeEntry.update({ where: { id: running.id }, data: { endedAt: end, minutes } });
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
  // With billing disabled the checkbox isn't rendered at all — default those
  // entries to billable=true so the split stays consistent ("not applicable"
  // rather than silently non-billable) if the flag is ever turned back on.
  const billable = tenant.billingEnabled ? formData.get("billable") !== null : true;
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
      billable,
      source: "manual",
    },
  });
  await bumpSpentHours(taskId, minutes);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

/** Flip billable/non-billable on an entry (owner or admin). */
export async function toggleBillableAction(id: string): Promise<{ ok: boolean }> {
  const { user, tenant } = await requireTenant();
  const entry = await prisma.taskTimeEntry.findFirst({ where: { id, tenantId: tenant.id } });
  if (!entry) return { ok: false };
  if (entry.userId !== user.id && !isAdminRole(user.role)) return { ok: false };
  await prisma.taskTimeEntry.update({ where: { id }, data: { billable: !entry.billable } });
  revalidatePath(`/tasks/${entry.taskId}`);
  revalidatePath("/time");
  revalidatePath("/reports/time");
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
