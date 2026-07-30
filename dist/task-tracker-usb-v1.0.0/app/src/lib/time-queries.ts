import "server-only";
import { prisma } from "./prisma";

/** Wire-friendly time entry (dates as ISO strings) shared by timesheet + reports UIs. */
export type TimeEntryWire = {
  id: string;
  taskId: string;
  taskTitle: string;
  projectId: string | null;
  projectName: string | null;
  sprintId: string | null;
  sprintName: string | null;
  userId: string;
  userName: string;
  minutes: number;
  startedAt: string;
  endedAt: string | null;
  billable: boolean;
  source: string;
  note: string | null;
};

export async function fetchTimeEntries(opts: {
  tenantId: string;
  from: Date;
  to: Date;
  userId?: string;
  projectId?: string;
  sprintId?: string;
}): Promise<TimeEntryWire[]> {
  const rows = await prisma.taskTimeEntry.findMany({
    where: {
      tenantId: opts.tenantId,
      startedAt: { gte: opts.from, lt: opts.to },
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.projectId || opts.sprintId
        ? {
            task: {
              ...(opts.projectId ? { projectId: opts.projectId } : {}),
              ...(opts.sprintId ? { sprintId: opts.sprintId } : {}),
            },
          }
        : {}),
    },
    include: {
      task: {
        select: {
          title: true,
          projectId: true,
          project: { select: { name: true } },
          sprintId: true,
          sprint: { select: { name: true } },
        },
      },
      user: { select: { name: true } },
    },
    orderBy: { startedAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    taskTitle: r.task.title,
    projectId: r.task.projectId,
    projectName: r.task.project?.name ?? null,
    sprintId: r.task.sprintId,
    sprintName: r.task.sprint?.name ?? null,
    userId: r.userId,
    userName: r.user.name,
    minutes: r.minutes,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    billable: r.billable,
    source: r.source,
    note: r.note,
  }));
}
