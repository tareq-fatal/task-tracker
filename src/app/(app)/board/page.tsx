import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { KanbanBoard } from "@/components/kanban-board";
import { ProjectFilter } from "@/components/project-filter";
import type { Locale } from "@/lib/enums";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: { project?: string };
}) {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());
  const projectId = searchParams.project;

  const where: any = {
    ...taskVisibility(user),
    status: { in: ["Todo", "InProgress", "Done"] },
  };
  if (projectId) where.projectId = projectId;

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({
      where,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assignedTo: { select: { name: true } },
        project: { select: { name: true, color: true } },
        _count: { select: { comments: true, attachments: true } },
      },
      orderBy: { priority: "asc" },
    }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="container py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t["board.title"]}</h1>
        <ProjectFilter
          projects={projects}
          current={projectId ?? "all"}
          basePath="/board"
        />
      </div>
      <KanbanBoard initialTasks={tasks} />
    </div>
  );
}
