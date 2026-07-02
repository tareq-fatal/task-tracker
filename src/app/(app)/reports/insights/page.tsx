import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { trend, burnoutRisk, rankBottleneck, effortVsReality, velocityForecast, forecastDelta } from "@/lib/insights";
import { InsightsView, type InsightsData } from "@/components/insights-view";

const DAY = 86400000;
const isOpen = (s: string) => s !== "Done" && s !== "Archived";

export default async function InsightsPage() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: { tenantId: tenant.id },
    select: {
      status: true, storyPoints: true, spentHours: true, createdAt: true, completedAt: true, dueDate: true,
      assignedToUserId: true, assignedTo: { select: { name: true } },
    },
  });

  // trend — completed this week vs previous week
  const doneIn = (from: number, to: number) => tasks.filter((x) => x.completedAt && x.completedAt.getTime() >= from && x.completedAt.getTime() < to).length;
  const thisWeek = doneIn(now.getTime() - 7 * DAY, now.getTime() + DAY);
  const lastWeek = doneIn(now.getTime() - 14 * DAY, now.getTime() - 7 * DAY);
  const tr = trend(thisWeek, lastWeek);

  // burnout — per assignee
  const perUser = new Map<string, { name: string; open: number; overdue: number }>();
  for (const x of tasks) {
    if (!x.assignedToUserId || !x.assignedTo) continue;
    const e = perUser.get(x.assignedToUserId) ?? { name: x.assignedTo.name, open: 0, overdue: 0 };
    if (isOpen(x.status)) { e.open++; if (x.dueDate && x.dueDate < now) e.overdue++; }
    perUser.set(x.assignedToUserId, e);
  }
  const burnout = [...perUser.entries()]
    .map(([userId, e]) => ({ ...e, risk: burnoutRisk({ userId, name: e.name, open: e.open, overdue: e.overdue }) }))
    .filter((u) => u.risk !== "none")
    .sort((a, b) => (a.risk === "high" ? -1 : 1) - (b.risk === "high" ? -1 : 1))
    .map((u) => ({ name: u.name, open: u.open, overdue: u.overdue, risk: u.risk as "high" | "medium" }));

  // bottleneck — avg age of open tasks per status
  const dwell = new Map<string, { total: number; count: number }>();
  for (const x of tasks) {
    if (!isOpen(x.status)) continue;
    const e = dwell.get(x.status) ?? { total: 0, count: 0 };
    e.total += (now.getTime() - x.createdAt.getTime()) / DAY;
    e.count++;
    dwell.set(x.status, e);
  }
  const bn = rankBottleneck([...dwell.entries()].map(([status, e]) => ({ status, avgAgeDays: Math.round(e.total / e.count), count: e.count })));

  // effort vs reality — done tasks with points + spent hours
  const effort = effortVsReality(tasks.filter((x) => !isOpen(x.status)).map((x) => ({ storyPoints: x.storyPoints, spentHours: x.spentHours })));

  // forecast — active sprint
  const sprint = await prisma.sprint.findFirst({ where: { tenantId: tenant.id, status: "active" }, include: { tasks: { select: { status: true, storyPoints: true } } } });
  let forecast: InsightsData["forecast"] = null;
  if (sprint) {
    const remaining = sprint.tasks.filter((x) => isOpen(x.status)).reduce((s, x) => s + (x.storyPoints ?? 0), 0);
    const donePoints14 = tasks.filter((x) => x.completedAt && x.completedAt.getTime() >= now.getTime() - 14 * DAY).reduce((s, x) => s + (x.storyPoints ?? 0), 0);
    const daysLeft = velocityForecast(remaining, donePoints14 / 14);
    forecast = { daysLeft, delta: forecastDelta(daysLeft, now, sprint.endDate), sprintName: sprint.name };
  }

  const data: InsightsData = { trend: { current: tr.direction === "flat" && thisWeek === 0 ? 0 : thisWeek, deltaPct: tr.deltaPct, direction: tr.direction }, forecast, burnout, bottleneck: bn, effort, hasData: tasks.length > 0 };

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold">{t["ins.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["ins.subtitle"]}</p>
      <InsightsView data={data} />
    </div>
  );
}
