import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { TaskExportFilters } from "./types";

/** Build a tenant-scoped Prisma `where` from the export filters. */
export function taskWhere(tenantId: string, f: TaskExportFilters = {}): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { tenantId };
  if (f.status) where.status = f.status;
  if (f.priority) where.priority = f.priority;
  if (f.projectId) where.projectId = f.projectId;
  if (f.teamId) where.teamId = f.teamId;
  if (f.sprintId) where.sprintId = f.sprintId;
  if (f.assigneeId) where.assignedToUserId = f.assigneeId;
  if (f.search && f.search.trim()) {
    const q = f.search.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  return where;
}

/** Count in-scope tasks — drives the sync-vs-async threshold. */
export function countTasks(tenantId: string, f: TaskExportFilters = {}): Promise<number> {
  return prisma.task.count({ where: taskWhere(tenantId, f) });
}

/**
 * Estimate how many tasks an export will touch, for the sync-vs-async decision.
 * Activity reports are aggregate (not task-bound) so they always run inline.
 */
export async function estimateTaskCount(
  tenantId: string,
  kind: string,
  opts: { filters?: TaskExportFilters; sprintId?: string | null; projectId?: string | null }
): Promise<number> {
  switch (kind) {
    case "tasks-excel":
      return countTasks(tenantId, opts.filters ?? {});
    case "sprint-pdf":
      return opts.sprintId
        ? prisma.task.count({ where: { tenantId, sprintId: opts.sprintId } })
        : 0;
    case "kanban-pdf":
      return prisma.task.count({
        where: { tenantId, status: { not: "Archived" }, ...(opts.projectId ? { projectId: opts.projectId } : {}) },
      });
    default:
      return 0; // activity-pdf and anything else → inline
  }
}

export type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  projectName: string | null;
  assigneeName: string | null;
  teamName: string | null;
  sprintName: string | null;
  dueDate: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  storyPoints: number | null;
  estimatedHours: number | null;
  spentHours: number;
  progress: number;
};

/** Load the full task list for the Excel export (tenant-scoped, filtered). */
export async function loadTaskRows(tenantId: string, f: TaskExportFilters = {}): Promise<TaskRow[]> {
  const rows = await prisma.task.findMany({
    where: taskWhere(tenantId, f),
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      type: true,
      dueDate: true,
      createdAt: true,
      completedAt: true,
      storyPoints: true,
      estimatedHours: true,
      spentHours: true,
      progress: true,
      project: { select: { name: true } },
      assignedTo: { select: { name: true } },
      team: { select: { name: true } },
      sprint: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    type: r.type,
    projectName: r.project?.name ?? null,
    assigneeName: r.assignedTo?.name ?? null,
    teamName: r.team?.name ?? null,
    sprintName: r.sprint?.name ?? null,
    dueDate: r.dueDate,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    storyPoints: r.storyPoints,
    estimatedHours: r.estimatedHours,
    spentHours: r.spentHours,
    progress: r.progress,
  }));
}

export type SprintReportData = {
  sprint: { id: string; name: string; goal: string | null; status: string; startDate: Date | null; endDate: Date | null; projectName: string | null };
  tasks: Array<{ title: string; status: string; assigneeName: string | null; storyPoints: number | null; completedAt: Date | null }>;
  velocity: Array<{ name: string; completed: number; total: number }>;
} | null;

/** Sprint report: the sprint, its tasks, and velocity across the project's sprints. */
export async function loadSprintReport(tenantId: string, sprintId: string): Promise<SprintReportData> {
  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, tenantId },
    select: {
      id: true, name: true, goal: true, status: true, startDate: true, endDate: true, projectId: true,
      project: { select: { name: true } },
      tasks: {
        orderBy: { status: "asc" },
        select: {
          title: true, status: true, storyPoints: true, completedAt: true,
          assignedTo: { select: { name: true } },
        },
      },
    },
  });
  if (!sprint) return null;

  // Velocity across all sprints in the same project (chronological).
  const projectSprints = await prisma.sprint.findMany({
    where: { tenantId, projectId: sprint.projectId },
    orderBy: { createdAt: "asc" },
    select: { name: true, tasks: { select: { status: true } } },
  });

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      goal: sprint.goal,
      status: sprint.status,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      projectName: sprint.project?.name ?? null,
    },
    tasks: sprint.tasks.map((t) => ({
      title: t.title,
      status: t.status,
      assigneeName: t.assignedTo?.name ?? null,
      storyPoints: t.storyPoints,
      completedAt: t.completedAt,
    })),
    velocity: projectSprints.map((s) => ({
      name: s.name,
      completed: s.tasks.filter((t) => t.status === "Done").length,
      total: s.tasks.length,
    })),
  };
}

/** Pick the tenant's active sprint (or most recent) when none is specified. */
export async function pickDefaultSprintId(tenantId: string): Promise<string | null> {
  const active = await prisma.sprint.findFirst({
    where: { tenantId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (active) return active.id;
  const latest = await prisma.sprint.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

export type ActivityReportData = {
  user: { id: string; name: string };
  windowDays: number;
  totals: { assigned: number; created: number; done: number; open: number; overdue: number };
  byType: Array<{ type: string; count: number }>;
  perDay: Array<{ date: string; count: number }>; // activity events per day
  recent: Array<{ type: string; detail: string | null; taskTitle: string; createdAt: Date }>;
} | null;

const DAY = 24 * 60 * 60 * 1000;

/** User-activity report: assignment/creation/completion totals + recent events. */
export async function loadActivityReport(
  tenantId: string,
  userId: string,
  windowDays: number,
  now: Date
): Promise<ActivityReportData> {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true, name: true } });
  if (!user) return null;
  const from = new Date(now.getTime() - windowDays * DAY);

  const [assignedTasks, createdCount, activity] = await Promise.all([
    prisma.task.findMany({
      where: { tenantId, assignedToUserId: userId },
      select: { status: true, dueDate: true },
    }),
    prisma.task.count({ where: { tenantId, createdByUserId: userId } }),
    prisma.activityLog.findMany({
      where: { userId, createdAt: { gte: from }, task: { tenantId } },
      orderBy: { createdAt: "desc" },
      select: { type: true, detail: true, createdAt: true, task: { select: { title: true } } },
    }),
  ]);

  let done = 0, open = 0, overdue = 0;
  for (const t of assignedTasks) {
    if (t.status === "Done") done++;
    else if (t.status !== "Archived") {
      open++;
      if (t.dueDate && t.dueDate < now) overdue++;
    }
  }

  const byTypeMap = new Map<string, number>();
  const perDayMap = new Map<string, number>();
  for (const a of activity) {
    byTypeMap.set(a.type, (byTypeMap.get(a.type) ?? 0) + 1);
    const d = a.createdAt.toISOString().slice(0, 10);
    perDayMap.set(d, (perDayMap.get(d) ?? 0) + 1);
  }
  const perDay: Array<{ date: string; count: number }> = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
    perDay.push({ date: d, count: perDayMap.get(d) ?? 0 });
  }

  return {
    user: { id: user.id, name: user.name },
    windowDays,
    totals: { assigned: assignedTasks.length, created: createdCount, done, open, overdue },
    byType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    perDay,
    recent: activity.slice(0, 25).map((a) => ({
      type: a.type,
      detail: a.detail,
      taskTitle: a.task.title,
      createdAt: a.createdAt,
    })),
  };
}

export type KanbanData = {
  projectName: string | null;
  columns: Array<{ key: string; title: string; tasks: Array<{ title: string; assigneeName: string | null; priority: string; storyPoints: number | null }> }>;
  taskCount: number;
};

const BASE_STATUSES = ["Todo", "InProgress", "Done"] as const;

/**
 * Kanban snapshot: tasks grouped by the project's custom workflow columns when
 * defined, else by base status. Archived tasks are excluded (as on the board).
 */
export async function loadKanban(
  tenantId: string,
  projectId: string | null,
  statusTitle: (s: string) => string
): Promise<KanbanData> {
  const where: Prisma.TaskWhereInput = { tenantId, status: { not: "Archived" } };
  if (projectId) where.projectId = projectId;

  const [project, columns, tasks] = await Promise.all([
    projectId ? prisma.project.findFirst({ where: { id: projectId, tenantId }, select: { name: true } }) : Promise.resolve(null),
    projectId
      ? prisma.workflowColumn.findMany({ where: { tenantId, projectId }, orderBy: { order: "asc" }, select: { id: true, name: true } })
      : Promise.resolve([]),
    prisma.task.findMany({
      where,
      orderBy: { position: "asc" },
      select: {
        title: true, status: true, priority: true, storyPoints: true, workflowColumnId: true,
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  type Card = { title: string; assigneeName: string | null; priority: string; storyPoints: number | null };
  const toCard = (t: (typeof tasks)[number]): Card => ({
    title: t.title,
    assigneeName: t.assignedTo?.name ?? null,
    priority: t.priority,
    storyPoints: t.storyPoints,
  });

  let cols: KanbanData["columns"];
  if (columns.length > 0) {
    const byCol = new Map<string, Card[]>();
    for (const c of columns) byCol.set(c.id, []);
    const unassigned: Card[] = [];
    for (const t of tasks) {
      if (t.workflowColumnId && byCol.has(t.workflowColumnId)) byCol.get(t.workflowColumnId)!.push(toCard(t));
      else unassigned.push(toCard(t));
    }
    cols = columns.map((c) => ({ key: c.id, title: c.name, tasks: byCol.get(c.id)! }));
    if (unassigned.length) cols.unshift({ key: "backlog", title: statusTitle("Todo"), tasks: unassigned });
  } else {
    cols = BASE_STATUSES.map((s) => ({
      key: s,
      title: statusTitle(s),
      tasks: tasks.filter((t) => t.status === s).map(toCard),
    }));
  }

  return { projectName: project?.name ?? null, columns: cols, taskCount: tasks.length };
}
