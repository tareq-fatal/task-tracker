import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskCardSelect } from "@/lib/task-select";
import { compareTasks } from "@/lib/tasks";
import { TASK_STATUSES, isTaskPriority, type Locale } from "@/lib/enums";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { UserDetailHeader } from "@/components/user-detail-header";
import { UserTaskFilters } from "@/components/user-task-filters";

const STATUS_DOT: Record<string, string> = {
  Todo: "bg-sky-500",
  InProgress: "bg-amber-500",
  Done: "bg-emerald-500",
  Archived: "bg-slate-400",
};

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { project?: string; priority?: string; due?: string };
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "Admin") redirect("/");
  const t = getDictionary(getActiveLocale() as Locale);

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) notFound();

  const where: any = { assignedToUserId: user.id };
  if (searchParams.project) where.projectId = searchParams.project;
  if (searchParams.priority && isTaskPriority(searchParams.priority)) {
    where.priority = searchParams.priority;
  }
  if (searchParams.due) {
    const d = new Date(searchParams.due);
    if (!Number.isNaN(d.getTime())) where.dueDate = { lte: d };
  }

  const [tasks, projects] = await Promise.all([
    prisma.task.findMany({ where, select: taskCardSelect }),
    prisma.project.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  tasks.sort((a, b) => compareTasks(a, b));
  const groups = TASK_STATUSES.map((status) => ({
    status,
    items: tasks.filter((x) => x.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="container py-6">
      <UserDetailHeader
        user={user}
        labels={{
          back: t["nav.admin.users"],
          tasks: t["tab.tasks"],
          performance: t["tab.performance"],
        }}
      />

      <div className="mb-5">
        <UserTaskFilters
          basePath={`/admin/users/${user.id}`}
          projects={projects}
          current={searchParams}
        />
      </div>

      {tasks.length === 0 ? (
        <EmptyState title={t["dashboard.empty"]} />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.status}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    STATUS_DOT[g.status] ?? "bg-slate-400"
                  }`}
                />
                {t[`status.${g.status}`]}
                <span className="text-muted-foreground">({g.items.length})</span>
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
