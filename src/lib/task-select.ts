import type { Prisma } from "@prisma/client";

/** Shared Prisma `select` for task cards across dashboard / board / projects. */
export const taskCardSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  progress: true,
  estimatedHours: true,
  spentHours: true,
  timerStartedAt: true,
  completedAt: true,
  assignedTo: { select: { name: true } },
  project: { select: { name: true, color: true } },
  _count: { select: { comments: true, attachments: true, subtasks: true } },
} satisfies Prisma.TaskSelect;
