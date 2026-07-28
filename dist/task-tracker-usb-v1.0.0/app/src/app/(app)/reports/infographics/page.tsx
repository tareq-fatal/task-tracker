import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole, TASK_STATUSES, TASK_PRIORITIES, type TaskStatus } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { computeKpis, type ReportTask } from "@/lib/reports";
import {
  buildHeatmap,
  distribution,
  topProjects,
  productivityScore,
  completionPrediction,
} from "@/lib/infographics";
import { InfographicSelector } from "@/components/infographic-selector";
import { InfographicView, type InfographicData } from "@/components/infographic-view";

const DAY = 24 * 60 * 60 * 1000;

function rangeStart(range: string, now: Date): Date {
  const d = new Date(now);
  switch (range) {
    case "week": {
      const dow = (d.getUTCDay() + 6) % 7;
      d.setUTCHours(0, 0, 0, 0);
      return new Date(d.getTime() - dow * DAY);
    }
    case "month":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    case "quarter":
      return new Date(now.getTime() - 90 * DAY);
    case "year":
      return new Date(now.getTime() - 365 * DAY);
    case "all":
      return new Date(0);
    default:
      return new Date(now.getTime() - 30 * DAY);
  }
}

export default async function InfographicsPage({
  searchParams,
}: {
  searchParams: { type?: string; id?: string; range?: string };
}) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const type = ["user", "team", "project"].includes(searchParams.type ?? "")
    ? (searchParams.type as "user" | "team" | "project")
    : "project";
  const range = searchParams.range ?? "last30";
  const now = new Date();
  const start = rangeStart(range, now);

  const [users, teams, projects] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const entities = type === "user" ? users : type === "team" ? teams : projects;
  const id = searchParams.id && entities.some((e) => e.id === searchParams.id) ? searchParams.id : entities[0]?.id ?? null;

  const labels: Record<string, string> = {
    score: t["infographic.score"], activity: t["infographic.activity"],
    statusDist: t["infographic.statusDist"], priorityDist: t["infographic.priorityDist"],
    total: t["reports.kpi.total"], empty: t["infographic.empty"],
    prediction: t["infographic.prediction"], days: t["infographic.days"], open: t["reports.kpi.open"],
  };

  let viewData: InfographicData | null = null;
  if (id) {
    const where =
      type === "user" ? { tenantId: tenant.id, assignedToUserId: id }
      : type === "team" ? { tenantId: tenant.id, teamId: id }
      : { tenantId: tenant.id, projectId: id };

    const rows = await prisma.task.findMany({
      where,
      select: {
        status: true, priority: true, createdAt: true, completedAt: true, dueDate: true, assignedToUserId: true,
        assignedTo: { select: { name: true } },
        project: { select: { name: true } },
      },
    });

    const tasks: ReportTask[] = rows.map((r) => ({
      status: r.status as TaskStatus, createdAt: r.createdAt, completedAt: r.completedAt,
      dueDate: r.dueDate, assignedToUserId: r.assignedToUserId,
    }));
    const kpis = computeKpis(tasks, now);
    const completions = rows.map((r) => r.completedAt).filter((d): d is Date => !!d && d >= start);
    const heatmap = buildHeatmap(completions, start, now);
    let onTime = 0, withDue = 0;
    for (const r of rows) if (r.completedAt && r.dueDate) { withDue++; if (r.completedAt <= r.dueDate) onTime++; }
    const windowDays = Math.max(1, Math.round((now.getTime() - start.getTime()) / DAY));
    const score = productivityScore({
      total: kpis.total, done: kpis.done, onTime, withDue,
      activeDays: heatmap.filter((c) => c.count > 0).length, windowDays: Math.min(windowDays, 30),
    });
    const prediction = completionPrediction(kpis.total, kpis.done, completions.length, windowDays);

    // breakdown differs per type
    let breakdown: { name: string; value: number }[];
    let breakdownLabel: string;
    if (type === "user") {
      breakdown = topProjects(rows.map((r) => ({ projectName: r.project?.name ?? null }))).map((p) => ({
        name: p.name,
        value: p.count,
      }));
      breakdownLabel = t["infographic.topProjects"];
    } else {
      const counts = new Map<string, number>();
      for (const r of rows) {
        const n = r.assignedTo?.name ?? t["task.unassigned"];
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
      breakdown = [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
      breakdownLabel = t["infographic.assigned"];
    }

    const entity = entities.find((e) => e.id === id)!;
    viewData = {
      title: entity.name,
      subtitle: `${kpis.done}/${kpis.total} ${t["reports.kpi.done"]} · ${kpis.overdue} ${t["reports.kpi.overdue"]}`,
      score,
      kpis: [
        { label: t["reports.kpi.total"], value: kpis.total, accent: "#fff" },
        { label: t["reports.kpi.done"], value: kpis.done, accent: "#fff" },
        { label: t["reports.kpi.overdue"], value: kpis.overdue, accent: "#fff" },
      ],
      heatmap,
      statusDist: distribution(rows as never[], "status", TASK_STATUSES),
      priorityDist: distribution(rows as never[], "priority", TASK_PRIORITIES),
      breakdown,
      breakdownLabel,
      prediction,
    };
  }

  return (
    <div className="container py-6">
      <h1 className="mb-6 text-2xl font-bold">{t["infographic.title"]}</h1>
      <InfographicSelector type={type} id={id} range={range} entities={entities} />
      {viewData ? (
        <InfographicView data={viewData} labels={labels} filename={`infographic-${type}`} brandLogo={tenant.logo} brandName={tenant.name} />
      ) : (
        <p className="text-sm text-muted-foreground">{t["infographic.empty"]}</p>
      )}
    </div>
  );
}
