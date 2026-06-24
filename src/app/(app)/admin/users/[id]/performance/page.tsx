import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Target, Timer, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { type Locale } from "@/lib/enums";
import {
  completedInRange,
  totalCompleted,
  onTimeRate,
  avgCompletionDays,
  overdueCount,
  productivityByDay,
  topProjects,
} from "@/lib/performance";
import { StatCard } from "@/components/stat-card";
import { LineChart } from "@/components/line-chart";
import { EmptyState } from "@/components/empty-state";
import { UserDetailHeader } from "@/components/user-detail-header";
import { Card, CardContent } from "@/components/ui/card";

export default async function UserPerformancePage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "Admin") redirect("/");
  const t = getDictionary(getActiveLocale() as Locale);

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) notFound();

  const tasks = await prisma.task.findMany({
    where: { assignedToUserId: user.id },
    select: {
      createdAt: true,
      completedAt: true,
      dueDate: true,
      status: true,
      project: { select: { id: true, name: true, color: true } },
    },
  });

  const now = new Date();
  const last7 = completedInRange(tasks, 7, now);
  const last30 = completedInRange(tasks, 30, now);
  const last90 = completedInRange(tasks, 90, now);
  const total = totalCompleted(tasks);
  const prev30 = completedInRange(tasks, 60, now) - last30;
  const otr = onTimeRate(tasks);
  const avg = avgCompletionDays(tasks);
  const overdue = overdueCount(tasks, now);
  const series = productivityByDay(tasks, 30, now);
  const top = topProjects(tasks, 5);
  const topMax = Math.max(1, ...top.map((p) => p.count));

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

      {tasks.length === 0 ? (
        <EmptyState title={t["perf.noData"]} />
      ) : (
        <div className="space-y-6">
          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label={t["perf.completed"]}
              value={total}
              icon={CheckCircle2}
              accent="emerald"
              trend={last30 > prev30 ? "up" : last30 < prev30 ? "down" : "flat"}
              trendLabel={`${last30} · ${t["perf.last30"]}`}
            />
            <StatCard
              label={t["perf.onTime"]}
              value={otr ? `${otr.rate}%` : "—"}
              icon={Target}
              accent="sky"
              hint={otr ? `(${otr.sample})` : undefined}
            />
            <StatCard
              label={t["perf.avgTime"]}
              value={avg != null ? avg : "—"}
              hint={avg != null ? t["perf.days"] : undefined}
              icon={Timer}
              accent="teal"
            />
            <StatCard
              label={t["perf.overdue"]}
              value={overdue}
              icon={AlertTriangle}
              accent={overdue > 0 ? "rose" : "sky"}
            />
          </div>

          {/* Completed buckets */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: t["perf.last7"], value: last7 },
              { label: t["perf.last30"], value: last30 },
              { label: t["perf.last90"], value: last90 },
              { label: t["perf.total"], value: total },
            ].map((b) => (
              <div
                key={b.label}
                className="rounded-xl border bg-card p-3 text-center shadow-sm"
              >
                <div className="text-2xl font-bold tabular-nums">{b.value}</div>
                <div className="text-xs text-muted-foreground">{b.label}</div>
              </div>
            ))}
          </div>

          {/* Productivity chart */}
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-4 text-sm font-semibold">
                {t["perf.productivity"]}
              </h2>
              <LineChart
                data={series}
                unitLabel={t["projects.tasks"].toLowerCase()}
              />
            </CardContent>
          </Card>

          {/* Top projects */}
          {top.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-4 text-sm font-semibold">
                  {t["perf.topProjects"]}
                </h2>
                <div className="space-y-3">
                  {top.map((p) => (
                    <div key={p.id} className="flex items-center gap-3">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="w-40 shrink-0 truncate text-sm font-medium">
                        {p.name}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(p.count / topMax) * 100}%`,
                            backgroundColor: p.color,
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-end text-sm tabular-nums text-muted-foreground">
                        {p.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
