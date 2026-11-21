import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility, canAccessProject } from "@/lib/task-access";
import { taskCardSelect } from "@/lib/task-select";
import { KanbanBoard } from "@/components/kanban-board";
import { BackLink } from "@/components/back-link";

export default async function ProjectBoardPage({
  params,
}: {
  params: { id: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project || project.tenantId !== tenant.id) notFound();
  if (!(await canAccessProject(user, tenant.id, project.id))) notFound();

  const tasks = await prisma.task.findMany({
    where: {
      projectId: project.id,
      ...(await taskVisibility(user, tenant.id)),
      status: { in: ["Todo", "InProgress", "Done"] },
    },
    select: taskCardSelect,
    orderBy: { priority: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <BackLink href={`/projects/${project.id}`} label={project.name} />
      <div className="mb-5 flex items-center gap-2">
        <span
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          {project.name} · {t["board.title"]}
        </h1>
      </div>
      <KanbanBoard initialTasks={tasks} />
    </div>
  );
}
