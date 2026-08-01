import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, TASK_STATUSES, TASK_PRIORITIES, type TaskStatus } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { computeKpis, burndownSeries, workloadByUser, type ReportTask } from "@/lib/reports";
import {
  buildHeatmap,
  distribution,
  topProjects,
  productivityScore,
  completionPrediction,
  currentStreak,
} from "@/lib/infographics";
import { ReportsDashboard } from "@/components/reports-dashboard";
import { ExportDialog } from "@/components/export-dialog";
import { ReportsTabs } from "@/components/reports-tabs";
import { InsightsSection } from "./insights-section";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const tabLabels = {
    reports: t["reports.tabReports"],
    insights: t["reports.tabInsights"],
  };

  // Kunden-Report 2026-08, Bug 3: "Berichte" + "Einblicke" are ONE nav entry
  // now; ?tab=insights renders the former /reports/insights page here.
  if (searchParams.tab === "insights") {
    return (
      <div className="container py-6">
        <ReportsTabs active="insights" labels={tabLabels} />
        <InsightsSection tenantId={tenant.id} />
      </div>
    );
  }

  const [rows, users, projects, sprints] = await Promise.all([
    prisma.task.findMany({
      where: { tenantId: tenant.id },
      select: {
        status: true,
        priority: true,
        createdAt: true,
        completedAt: true,
        dueDate: true,
        assignedToUserId: true,
        project: { select: { name: true } },
      },
    }),
    prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.sprint.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const now = new Date();
  const tasks: ReportTask[] = rows.map((r) => ({
    status: r.status as TaskStatus,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    dueDate: r.dueDate,
    assignedToUserId: r.assignedToUserId,
  }));

  const kpis = computeKpis(tasks, now);
  const burndown = burndownSeries(tasks, now, 30);
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const workload = workloadByUser(tasks, (id) => nameById.get(id) ?? "—");

  // Heatmap of completions over the last ~17 weeks
  const HEAT_DAYS = 118;
  const from = new Date(now.getTime() - HEAT_DAYS * 24 * 60 * 60 * 1000);
  const completions = rows.map((r) => r.completedAt).filter((d): d is Date => !!d);
  const heatmap = buildHeatmap(completions, from, now);
  const bestCell = heatmap.reduce<{ date: string; count: number } | null>(
    (best, c) => (c.count > (best?.count ?? 0) ? c : best),
    null
  );

  // on-time stats for productivity
  let onTime = 0,
    withDue = 0;
  for (const r of rows) {
    if (r.completedAt && r.dueDate) {
      withDue++;
      if (r.completedAt <= r.dueDate) onTime++;
    }
  }
  const last30 = heatmap.slice(-30);
  const activeDays = last30.filter((c) => c.count > 0).length;
  const score = productivityScore({
    total: kpis.total,
    done: kpis.done,
    onTime,
    withDue,
    activeDays,
    windowDays: 30,
  });
  const prediction = completionPrediction(
    kpis.total,
    kpis.done,
    last30.reduce((a, c) => a + c.count, 0),
    30
  );

  return (
    <ReportsDashboard
      tabs={<ReportsTabs active="reports" labels={tabLabels} />}
      actions={
        <ExportDialog
          hasLogo={Boolean(tenant.logo)}
          projects={projects}
          users={users}
          sprints={sprints}
        />
      }
      labels={{
        title: t["reports.title"],
        total: t["reports.kpi.total"],
        done: t["reports.kpi.done"],
        open: t["reports.kpi.open"],
        doneWeek: t["reports.kpi.doneWeek"],
        avgDays: t["reports.kpi.avgDays"],
        overdue: t["reports.kpi.overdue"],
        burndown: t["reports.burndown"],
        workload: t["reports.workload"],
        statusDist: t["infographic.statusDist"],
        priorityDist: t["infographic.priorityDist"],
        activity: t["infographic.activity"],
        topProjects: t["infographic.topProjects"],
        score: t["infographic.score"],
        streak: t["infographic.streak"],
        bestDay: t["infographic.bestDay"],
        prediction: t["infographic.prediction"],
        days: t["infographic.days"],
        infographics: t["infographic.open"],
        empty: t["reports.empty"],
      }}
      data={{
        kpis,
        burndown,
        workload: workload.map((w) => ({ name: w.name, todo: w.todo, inProgress: w.inProgress, done: w.done })),
        heatmap,
        statusDist: distribution(rows as never[], "status", TASK_STATUSES),
        priorityDist: distribution(rows as never[], "priority", TASK_PRIORITIES),
        topProjects: topProjects(rows.map((r) => ({ projectName: r.project?.name ?? null }))),
        score,
        streak: currentStreak(heatmap),
        bestDay: bestCell,
        prediction,
        doneSparkline: heatmap.slice(-14).map((c) => c.count),
      }}
    />
  );
}
