import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, type TaskStatus } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import {
  computeKpis,
  burndownSeries,
  workloadByUser,
  type ReportTask,
} from "@/lib/reports";
import { KpiCards } from "@/components/kpi-cards";
import { ReportsCharts } from "@/components/reports-charts";

export default async function ReportsPage() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");

  const t = getDictionary(getActiveLocale());

  const [rows, users] = await Promise.all([
    prisma.task.findMany({
      where: { tenantId: tenant.id },
      select: {
        status: true,
        createdAt: true,
        completedAt: true,
        dueDate: true,
        assignedToUserId: true,
      },
    }),
    prisma.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    }),
  ]);

  const tasks: ReportTask[] = rows.map((r) => ({
    status: r.status as TaskStatus,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    dueDate: r.dueDate,
    assignedToUserId: r.assignedToUserId,
  }));

  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const now = new Date();
  const kpis = computeKpis(tasks, now);
  const burndown = burndownSeries(tasks, now, 30);
  const workload = workloadByUser(tasks, (id) => nameById.get(id) ?? "—");

  return (
    <div className="container py-6">
      <h1 className="mb-6 text-2xl font-bold">{t["reports.title"]}</h1>

      <div className="mb-6">
        <KpiCards
          items={[
            { label: t["reports.kpi.total"], value: kpis.total, accent: "sky" },
            { label: t["reports.kpi.done"], value: kpis.done, accent: "teal" },
            { label: t["reports.kpi.open"], value: kpis.open },
            { label: t["reports.kpi.doneWeek"], value: kpis.doneThisWeek, accent: "teal" },
            { label: t["reports.kpi.avgDays"], value: kpis.avgCompletionDays ?? "—" },
            { label: t["reports.kpi.overdue"], value: kpis.overdue, accent: "rose" },
          ]}
        />
      </div>

      <ReportsCharts
        burndown={burndown}
        workload={workload.map((w) => ({
          name: w.name,
          todo: w.todo,
          inProgress: w.inProgress,
          done: w.done,
        }))}
        labels={{
          burndown: t["reports.burndown"],
          workload: t["reports.workload"],
          open: t["reports.open"],
          done: t["reports.done"],
          todo: t["reports.todo"],
          inProgress: t["reports.inProgress"],
          empty: t["reports.empty"],
        }}
      />
    </div>
  );
}
