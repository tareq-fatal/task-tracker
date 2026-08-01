"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { sampleProjectFor } from "@/lib/onboarding-sample";

/** Mark first-time onboarding as done (finished or skipped). Idempotent. */
export async function completeOnboardingAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    // hasSeenTour is also flipped so the Joyride tour never re-triggers after a
    // user has been through (or skipped) the welcome flow.
    data: { onboardedAt: new Date(), hasSeenTour: true },
  });
  return { ok: true };
}

/** Replay the whole onboarding (welcome modal + tour). Settings → restart. */
export async function restartOnboardingAction(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { onboardedAt: null, hasSeenTour: false },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Create the demo "example project" during onboarding — a small, realistic
 * board with tasks across statuses, subtasks, an active sprint, and the user
 * added as a member. Admin-only (regular users can't own projects, #37).
 * Idempotent per user via a deterministic externalId, so a double-click or a
 * re-run won't spawn duplicates.
 */
export async function createSampleProjectAction(): Promise<{
  ok: boolean;
  projectId?: string;
  error?: string;
}> {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) return { ok: false, error: "FORBIDDEN" };

  const externalId = `onboarding-sample:${user.id}`;

  // Idempotency — if this user already has a sample project, just return it.
  const existing = await prisma.project.findFirst({
    where: { externalId, tenantId: tenant.id },
  });
  if (existing) return { ok: true, projectId: existing.id };

  const data = sampleProjectFor(user.locale);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const project = await prisma.project.create({
    data: {
      name: data.name,
      description: data.description,
      color: data.color,
      externalId,
      createdByUserId: user.id,
      tenantId: tenant.id,
      members: { create: { userId: user.id } },
      sprints: {
        create: {
          tenantId: tenant.id,
          name: data.sprintName,
          goal: data.sprintGoal,
          status: "active",
          startDate: new Date(now - 3 * day),
          endDate: new Date(now + 11 * day),
        },
      },
    },
    include: { sprints: true },
  });

  const sprintId = project.sprints[0]?.id ?? null;

  // Positions are per-status; keep a small counter so cards order sensibly.
  const posByStatus: Record<string, number> = {};
  for (const t of data.tasks) {
    const position = posByStatus[t.status] ?? 0;
    posByStatus[t.status] = position + 1;

    const subCount = t.subtasks?.length ?? 0;
    const doneCount = Math.round(((t.progress ?? 0) / 100) * subCount);

    await prisma.task.create({
      data: {
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        priority: t.priority,
        type: t.type ?? "Task",
        storyPoints: t.storyPoints ?? null,
        progress: t.progress ?? 0,
        position,
        dueDate:
          t.dueInDays != null ? new Date(now + t.dueInDays * day) : null,
        completedAt: t.status === "Done" ? new Date(now - day) : null,
        projectId: project.id,
        sprintId,
        tenantId: tenant.id,
        createdByUserId: user.id,
        assignedToUserId: user.id,
        subtasks: t.subtasks
          ? {
              create: t.subtasks.map((s, i) => ({
                title: s.title,
                order: i,
                done: i < doneCount,
              })),
            }
          : undefined,
      },
    });
  }

  revalidatePath("/projects");
  revalidatePath("/board");
  return { ok: true, projectId: project.id };
}
