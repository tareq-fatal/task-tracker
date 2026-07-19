import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { compareTasks, isOverdue } from "@/lib/tasks";
import { taskCardSelect } from "@/lib/task-select";
import { computeKpis, type ReportTask } from "@/lib/reports";
import { TaskCard } from "@/components/task-card";
import { KpiCards } from "@/components/kpi-cards";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { TaskStatus } from "@/lib/enums";

const cardSelect = taskCardSelect;

export default async function DashboardPage() {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  // "مهامي" = EVERY task the user is involved in: primary assignee (Hauptkopf),
  // co-assignee (#13 TaskAssignee), or creator. The two sections stay disjoint —
  // anything I'm assigned to shows under "assigned", the rest of what I created
  // under "created" — so together they cover the full involvement set.
  const assignedToMe = {
    OR: [
      { assignedToUserId: user.id },
      { assignees: { some: { userId: user.id } } },
    ],
  };
  const [assigned, created] = await Promise.all([
    prisma.task.findMany({
      where: {
        tenantId: tenant.id,
        status: { not: "Archived" },
        ...assignedToMe,
      },
      select: cardSelect,
    }),
    prisma.task.findMany({
      where: {
        tenantId: tenant.id,
        createdByUserId: user.id,
        status: { not: "Archived" },
        NOT: assignedToMe,
      },
      select: cardSelect,
    }),
  ]);

  assigned.sort((a, b) => compareTasks(a, b));
  created.sort((a, b) => compareTasks(a, b));

  const overdueCount = assigned.filter((x) =>
    isOverdue(x.dueDate, x.status as any)
  ).length;

  // KPI snapshot over all tasks the user is involved in (incl. completed).
  const kpiRows = await prisma.task.findMany({
    where: {
      tenantId: tenant.id,
      OR: [
        { assignedToUserId: user.id },
        { createdByUserId: user.id },
        { assignees: { some: { userId: user.id } } },
      ],
    },
    select: {
      status: true,
      createdAt: true,
      completedAt: true,
      dueDate: true,
      assignedToUserId: true,
    },
  });
  const kpiTasks: ReportTask[] = kpiRows.map((r) => ({
    status: r.status as TaskStatus,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    dueDate: r.dueDate,
    assignedToUserId: r.assignedToUserId,
  }));
  const kpis = computeKpis(kpiTasks, new Date());

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

      <div className="mb-8">
        <KpiCards
          items={[
            { label: t["reports.kpi.total"], value: kpis.total, accent: "sky" },
            { label: t["reports.kpi.doneWeek"], value: kpis.doneThisWeek, accent: "teal" },
            { label: t["reports.kpi.avgDays"], value: kpis.avgCompletionDays ?? "—" },
            { label: t["reports.kpi.overdue"], value: kpis.overdue, accent: "rose" },
          ]}
        />
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
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {created.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
