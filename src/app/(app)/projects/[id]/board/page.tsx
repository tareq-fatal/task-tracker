import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { KanbanBoard } from "@/components/kanban-board";
import type { Locale } from "@/lib/enums";

export default async function ProjectBoardPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) notFound();

  const tasks = await prisma.task.findMany({
    where: {
      projectId: project.id,
      ...taskVisibility(user),
      status: { in: ["Todo", "InProgress", "Done"] },
    },
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
  });

  return (
    <div className="container py-6">
      <Link
        href={`/projects/${project.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {project.name}
      </Link>
      <div className="mb-5 flex items-center gap-2">
        <span
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <h1 className="text-2xl font-bold">
          {project.name} · {t["board.title"]}
        </h1>
      </div>
      <KanbanBoard initialTasks={tasks} />
    </div>
  );
}
