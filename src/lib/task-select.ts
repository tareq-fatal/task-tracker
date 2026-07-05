import type { Prisma } from "@prisma/client";

/** Shared Prisma `select` for task cards across dashboard / board / projects. */
export const taskCardSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  storyPoints: true,
  progress: true,
  estimatedHours: true,
  spentHours: true,
  timerStartedAt: true,
  completedAt: true,
  assignedTo: { select: { name: true, avatar: true } },
  project: { select: { name: true, color: true } },
  _count: { select: { comments: true, attachments: true, subtasks: true } },
  // Blockers for the "waiting on N" card badge: outgoing "DependsOn" plus
  // incoming "Blocks" (the same relationship written from the other end).
  linksFrom: {
    where: { type: "DependsOn" },
    select: { linkedTask: { select: { status: true } } },
  },
  linksTo: {
    where: { type: "Blocks" },
    select: { task: { select: { status: true } } },
  },
} satisfies Prisma.TaskSelect;
