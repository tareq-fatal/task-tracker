import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KanbanSquare, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { taskCardSelect } from "@/lib/task-select";
import { compareTasks } from "@/lib/tasks";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());

  const project = await prisma.project.findUnique({
    where: { id: params.id },
  });
  if (!project) notFound();

  const tasks = await prisma.task.findMany({
    where: { projectId: project.id, ...taskVisibility(user) },
    select: taskCardSelect,
  });
  tasks.sort((a, b) => compareTasks(a, b));

  return (
    <div className="container py-6">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t["projects.title"]}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-2xl font-bold">{project.name}</h1>
          </div>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/projects/${project.id}/board`}>
              <KanbanSquare className="me-1 h-4 w-4" />
              {t["projects.openBoard"]}
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/tasks/new?project=${project.id}`}>
              <Plus className="me-1 h-4 w-4" />
              {t["nav.newTask"]}
            </Link>
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          title={t["dashboard.empty"]}
          action={
            <Button asChild>
              <Link href={`/tasks/new?project=${project.id}`}>
                <Plus className="me-1 h-4 w-4" />
                {t["nav.newTask"]}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
