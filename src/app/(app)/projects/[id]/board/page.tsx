import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { taskCardSelect } from "@/lib/task-select";
import { KanbanBoard } from "@/components/kanban-board";

export default async function ProjectBoardPage({
  params,
}: {
  params: { id: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project || project.tenantId !== tenant.id) notFound();

  const tasks = await prisma.task.findMany({
    where: {
      projectId: project.id,
      ...taskVisibility(user, tenant.id),
      status: { in: ["Todo", "InProgress", "Done"] },
    },
    select: taskCardSelect,
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
