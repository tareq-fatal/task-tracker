"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { sprintBurndown, velocity, averageVelocity, type BurndownPoint } from "@/lib/sprints";
import { trackServerEvent, ANALYTICS_EVENTS } from "@/lib/analytics";
import { dispatchWebhookEvent } from "@/lib/webhooks-dispatch";

export type SprintState = { ok?: boolean; error?: string };

type SprintTaskLite = { id: string; title: string; status: string; blocked: boolean };

type SprintLite = {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  tasks: SprintTaskLite[];
};

export type SprintsView = {
  projects: { id: string; name: string }[];
  projectId: string | null;
  sprints: SprintLite[];
  backlog: SprintTaskLite[];
  targetSprintId: string | null; // where "add to sprint" sends a backlog task
  burndown: BurndownPoint[];
  velocity: Array<{ name: string; completed: number; total: number }>;
  avgVelocity: number;
};

async function requireAdminTenant() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) throw new Error("FORBIDDEN");
  return { user, tenant };
}

export async function getSprintsView(projectId?: string): Promise<SprintsView> {
  const { tenant } = await requireTenant();
  const projects = await prisma.project.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const pid = projectId && projects.some((p) => p.id === projectId) ? projectId : projects[0]?.id ?? null;
  if (!pid) {
    return { projects, projectId: null, sprints: [], backlog: [], targetSprintId: null, burndown: [], velocity: [], avgVelocity: 0 };
  }

  const sprints = await prisma.sprint.findMany({
    where: { tenantId: tenant.id, projectId: pid },
    include: { tasks: { select: { id: true, title: true, status: true, completedAt: true } } },
    orderBy: { createdAt: "asc" },
  });
  const backlog = await prisma.task.findMany({
    where: { tenantId: tenant.id, projectId: pid, sprintId: null, status: { not: "Archived" } },
    select: { id: true, title: true, status: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  // Blocked-state for every task shown here (sprint tasks + backlog): a task
  // is blocked while an open task exists that it DependsOn, or that Blocks it.
  const shownIds = new Set<string>([
    ...sprints.flatMap((s) => s.tasks.map((t) => t.id)),
    ...backlog.map((t) => t.id),
  ]);
  const depLinks = shownIds.size
    ? await prisma.taskLink.findMany({
        where: {
          type: { in: ["DependsOn", "Blocks"] },
          OR: [
            { taskId: { in: [...shownIds] } },
            { linkedTaskId: { in: [...shownIds] } },
          ],
        },
        select: {
          taskId: true,
          linkedTaskId: true,
          type: true,
          task: { select: { status: true } },
          linkedTask: { select: { status: true } },
        },
      })
    : [];
  const open = (s: string) => s !== "Done" && s !== "Archived";
  const blockedIds = new Set<string>();
  for (const l of depLinks) {
    if (l.type === "DependsOn" && shownIds.has(l.taskId) && open(l.linkedTask.status)) {
      blockedIds.add(l.taskId);
    }
    if (l.type === "Blocks" && shownIds.has(l.linkedTaskId) && open(l.task.status)) {
      blockedIds.add(l.linkedTaskId);
    }
  }
  const withBlocked = (t: { id: string; title: string; status: string }) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    blocked: open(t.status) && blockedIds.has(t.id),
  });

  const active = sprints.find((s) => s.status === "active");
  const planned = sprints.find((s) => s.status === "planned");
  const target = active ?? planned ?? null;

  const now = new Date();
  const burndown =
    active && active.startDate && active.endDate
      ? sprintBurndown(active.tasks, active.startDate, active.endDate, now)
      : [];

  const closed = sprints.filter((s) => s.status === "closed");
  const vel = velocity(closed.map((s) => ({ name: s.name, tasks: s.tasks })));

  return {
    projects,
    projectId: pid,
    targetSprintId: target?.id ?? null,
    backlog: backlog.map(withBlocked),
    burndown,
    velocity: vel,
    avgVelocity: averageVelocity(closed.map((s) => ({ name: s.name, tasks: s.tasks }))),
    sprints: sprints.map((s) => ({
      id: s.id,
      name: s.name,
      goal: s.goal,
      status: s.status,
      startDate: s.startDate?.toISOString() ?? null,
      endDate: s.endDate?.toISOString() ?? null,
      tasks: s.tasks.map(withBlocked),
    })),
  };
}

export async function createSprintAction(
  _prev: SprintState,
  formData: FormData
): Promise<SprintState> {
  const { tenant } = await requireAdminTenant();
  const projectId = formData.get("projectId")?.toString() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  if (!projectId || !name) return { error: "MISSING" };
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) return { error: "NOT_FOUND" };

  const startRaw = formData.get("startDate")?.toString();
  const endRaw = formData.get("endDate")?.toString();
  await prisma.sprint.create({
    data: {
      tenantId: tenant.id,
      projectId,
      name,
      goal: formData.get("goal")?.toString().trim() || null,
      startDate: startRaw ? new Date(startRaw) : null,
      endDate: endRaw ? new Date(endRaw) : null,
      status: "planned",
    },
  });
  revalidatePath("/sprints");
  return { ok: true };
}

export async function setSprintStatusAction(
  sprintId: string,
  status: string
): Promise<SprintState> {
  const { tenant } = await requireAdminTenant();
  const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, tenantId: tenant.id } });
  if (!sprint) return { error: "NOT_FOUND" };
  if (!["planned", "active", "closed"].includes(status)) return { error: "STATUS" };

  if (status === "active") {
    // only one active sprint per project
    await prisma.sprint.updateMany({
      where: { tenantId: tenant.id, projectId: sprint.projectId, status: "active" },
      data: { status: "closed" },
    });
  }
  await prisma.sprint.update({ where: { id: sprintId }, data: { status } });

  if (status === "closed") {
    // auto-rollover: unfinished tasks go back to the backlog
    await prisma.task.updateMany({
      where: { sprintId, status: { notIn: ["Done", "Archived"] } },
      data: { sprintId: null },
    });
    trackServerEvent(ANALYTICS_EVENTS.SPRINT_CLOSED, { projectId: sprint.projectId });
    const project = await prisma.project.findUnique({ where: { id: sprint.projectId }, select: { name: true } });
    await dispatchWebhookEvent({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      event: "sprint.closed",
      data: { id: sprint.id, name: sprint.name, projectId: sprint.projectId, projectName: project?.name ?? null },
    });
  }
  revalidatePath("/sprints");
  return { ok: true };
}

export async function setTaskSprintAction(
  taskId: string,
  sprintId: string | null
): Promise<SprintState> {
  const { tenant } = await requireAdminTenant();
  const task = await prisma.task.findFirst({ where: { id: taskId, tenantId: tenant.id } });
  if (!task) return { error: "NOT_FOUND" };
  if (sprintId) {
    const sprint = await prisma.sprint.findFirst({ where: { id: sprintId, tenantId: tenant.id, projectId: task.projectId ?? undefined } });
    if (!sprint) return { error: "SPRINT_NOT_FOUND" };
  }
  await prisma.task.update({ where: { id: taskId }, data: { sprintId } });
  revalidatePath("/sprints");
  return { ok: true };
}
