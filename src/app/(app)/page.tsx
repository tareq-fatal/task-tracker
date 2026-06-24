import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { compareTasks, isOverdue } from "@/lib/tasks";
import { taskCardSelect } from "@/lib/task-select";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

const cardSelect = taskCardSelect;

export default async function DashboardPage() {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());

  const [assigned, created] = await Promise.all([
    prisma.task.findMany({
      where: { assignedToUserId: user.id, status: { not: "Archived" } },
      select: cardSelect,
    }),
    prisma.task.findMany({
      where: {
        createdByUserId: user.id,
        assignedToUserId: { not: user.id },
        status: { not: "Archived" },
      },
      select: cardSelect,
    }),
  ]);

  assigned.sort((a, b) => compareTasks(a, b));
  created.sort((a, b) => compareTasks(a, b));

  const overdueCount = assigned.filter((x) =>
    isOverdue(x.dueDate, x.status as any)
  ).length;

  return (
    <div className="container py-6" data-tour="dashboard">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t["dashboard.title"]}</h1>
          {overdueCount > 0 && (
            <p className="mt-1 text-sm font-medium text-rose-600">
              {overdueCount} {t["dashboard.overdue"].toLowerCase()}
            </p>
          )}
        </div>
        <Button asChild className="hidden sm:flex">
          <Link href="/tasks/new">
            <Plus className="me-1 h-4 w-4" />
            {t["nav.newTask"]}
          </Link>
        </Button>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t["dashboard.assignedToMe"]} ({assigned.length})
        </h2>
        {assigned.length === 0 ? (
          <EmptyState
            title={t["dashboard.empty"]}
            action={
              <Button asChild>
                <Link href="/tasks/new">
                  <Plus className="me-1 h-4 w-4" />
                  {t["nav.newTask"]}
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {assigned.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>

      {created.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t["dashboard.createdByMe"]} ({created.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {created.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
