import type { Prisma } from "@prisma/client";

/** Shared Prisma `select` for task cards across dashboard / board / projects. */
export const taskCardSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  tags: true,
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
  // Up to 3 image previews per card. Tarek 2026-08-14: a list of 164 titles is
  // unusable — you have to SEE what a task is about while scrolling. Only ids
  // and mime types travel; the picture itself comes from the access-checked
  // /download/attachment/<id>?thumb=1 route.
  attachments: {
    where: { deletedAt: null, mimeType: { startsWith: "image/" } },
    orderBy: { uploadedAt: "asc" },
    take: 3,
    select: { id: true, fileName: true, mimeType: true },
  },
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
