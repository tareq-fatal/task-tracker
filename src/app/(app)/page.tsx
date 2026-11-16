import Link from "next/link";
import { ArrowRight, CircleDot, Loader, AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { startOfWeek, addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { compareTasks, isOverdue } from "@/lib/tasks";
import { taskVisibility } from "@/lib/task-access";
import { formatRelative } from "@/lib/format";
import { TaskRow } from "@/components/task-row";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/enums";

/** Platzhalter {name} in Texten ersetzen (Server-Seite). */
function fmt(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

const rowSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  dueDate: true,
  project: { select: { name: true, color: true } },
} as const;

/**
 * TOF-0962 Dashboard: Kennzahlen + das, was heute zählt. Früher wurden ALLE
 * zugewiesenen Aufgaben als Karten gerendert (bei Tarek > 500) — jetzt höchstens
 * je 8 Zeilen, Zählwerte kommen aus der Datenbank.
 */
export default async function DashboardPage() {
  const { user, tenant } = await requireTenant();
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const now = new Date();

  // „Meine“ = Hauptkopf ODER Mit-Zuständige (#13 TaskAssignee).
  const assignedToMe = {
    OR: [{ assignedToUserId: user.id }, { assignees: { some: { userId: user.id } } }],
  };
  const visibility = await taskVisibility(user, tenant.id);

  const [open, doneThisWeek, projectGroups, activity] = await Promise.all([
    prisma.task.findMany({
      where: { tenantId: tenant.id, status: { in: ["Todo", "InProgress"] }, ...assignedToMe },
      select: rowSelect,
    }),
    prisma.task.count({
      where: {
        tenantId: tenant.id,
        status: "Done",
        completedAt: { gte: startOfWeek(now, { weekStartsOn: 1 }) },
        ...assignedToMe,
      },
    }),
    prisma.task.groupBy({
      by: ["projectId", "status"],
      where: { AND: [visibility, { projectId: { not: null }, status: { in: ["Todo", "InProgress", "Done"] } }] },
      _count: { _all: true },
    }),
    prisma.activityLog.findMany({
      where: { task: visibility },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        type: true,
        createdAt: true,
        user: { select: { name: true } },
        task: { select: { id: true, title: true } },
      },
    }),
  ]);

  open.sort((a, b) => compareTasks(a, b, now));
  const inProgressCount = open.filter((x) => x.status === "InProgress").length;
  const overdueCount = open.filter((x) => isOverdue(x.dueDate, x.status as TaskStatus, now)).length;
  const horizon = addDays(now, 7);
  const focus = open
    .filter((x) => x.dueDate && new Date(x.dueDate) <= horizon)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 8);
  const focusIds = new Set(focus.map((x) => x.id));
  const next = open.filter((x) => !focusIds.has(x.id)).slice(0, 8);

  // Projekte: offen/erledigt je Projekt, die 6 mit den meisten offenen.
  const byProject = new Map<string, { open: number; done: number }>();
  for (const g of projectGroups) {
    if (!g.projectId) continue;
    const e = byProject.get(g.projectId) ?? { open: 0, done: 0 };
    if (g.status === "Done") e.done += g._count._all;
    else e.open += g._count._all;
    byProject.set(g.projectId, e);
  }
  const topIds = [...byProject.entries()]
    .filter(([, v]) => v.open > 0)
    .sort((a, b) => b[1].open - a[1].open)
    .slice(0, 6)
    .map(([id]) => id);
  const projects = topIds.length
    ? await prisma.project.findMany({
        where: { tenantId: tenant.id, id: { in: topIds } },
        select: { id: true, name: true, color: true },
      })
    : [];
  projects.sort((a, b) => topIds.indexOf(a.id) - topIds.indexOf(b.id));

  const kpis = [
    { label: t["dash.kpi.open"], value: open.length, icon: CircleDot, href: "/list?nur=ich", tone: "neutral" },
    { label: t["dash.kpi.inProgress"], value: inProgressCount, icon: Loader, href: "/board", tone: "neutral" },
    {
      label: t["dash.kpi.overdue"],
      value: overdueCount,
      icon: AlertTriangle,
      href: "/list?nur=ich",
      tone: overdueCount > 0 ? "danger" : "neutral",
    },
    { label: t["dash.kpi.doneWeek"], value: doneThisWeek, icon: CheckCircle2, href: "/list", tone: "success" },
  ] as const;

  const dateLine = new Intl.DateTimeFormat(locale === "ar" ? "ar-SY" : locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8" data-tour="dashboard">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">{dateLine}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-[28px]">{t["dashboard.title"]}</h1>
      </div>

      {/* Kennzahlen */}
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className="group rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-foreground/15 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">{k.label}</span>
              <k.icon
                className={cn(
                  "h-4 w-4",
                  k.tone === "danger" ? "text-destructive" : k.tone === "success" ? "text-success" : "text-muted-foreground"
                )}
              />
            </div>
            <div
              className={cn(
                "mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl",
                k.tone === "danger" && "text-destructive"
              )}
            >
              {k.value}
            </div>
          </Link>
        ))}
      </div>

      {open.length === 0 ? (
        <EmptyState
          title={t["dashboard.empty"]}
          action={
            <Button asChild>
              <Link href="/tasks/new">
                <Plus className="h-4 w-4" />
                {t["nav.newTask"]}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel
              title={t["dash.focus"]}
              hint={t["dash.focusHint"]}
              count={focus.length}
              href="/list?nur=ich"
              linkLabel={t["dash.showAll"]}
            >
              {focus.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">{t["dash.nothingDue"]}</p>
              ) : (
                focus.map((task) => <TaskRow key={task.id} task={task} />)
              )}
            </Panel>

            <Panel
              title={t["dashboard.assignedToMe"]}
              count={open.length}
              href="/list?nur=ich"
              linkLabel={t["dash.showAll"]}
            >
              {next.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">{t["dash.nothingInProgress"]}</p>
              ) : (
                next.map((task) => <TaskRow key={task.id} task={task} />)
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            {projects.length > 0 && (
              <Panel title={t["dash.projects"]} href="/projects" linkLabel={t["dash.showAll"]}>
                {projects.map((p) => {
                  const c = byProject.get(p.id)!;
                  const total = c.open + c.done;
                  const pct = total ? Math.round((c.done / total) * 100) : 0;
                  return (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="block px-4 py-3 transition-colors hover:bg-accent/60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {fmt(t["projects.openTasks"], { n: c.open })}
                        </span>
                      </div>
                      <div
                        className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={fmt(t["projects.doneShare"], { p: pct })}
                      >
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </Panel>
            )}

            {activity.length > 0 && (
              <Panel title={t["dash.activity"]}>
                <ol className="px-4 py-2">
                  {activity.map((a, i) => (
                    <li key={a.id} className="relative flex gap-3 py-2">
                      {i < activity.length - 1 && (
                        <span className="absolute start-[3px] top-5 h-[calc(100%-0.5rem)] w-px bg-border" aria-hidden />
                      )}
                      <span className="mt-1.5 h-[7px] w-[7px] shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
                      <div className="min-w-0 text-sm">
                        <p className="leading-snug">
                          <span className="font-medium">{a.user.name}</span>{" "}
                          <span className="text-muted-foreground">
                            {(t as Record<string, string>)[`activity.${a.type}`] ?? a.type}
                          </span>
                        </p>
                        <Link
                          href={`/tasks/${a.task.id}`}
                          dir="auto"
                          className="block truncate text-start text-sm text-foreground/90 underline-offset-2 hover:underline"
                        >
                          {a.task.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatRelative(a.createdAt, locale, now)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  hint,
  count,
  href,
  linkLabel,
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-card">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count != null && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {hint && <span className="hidden text-xs text-muted-foreground sm:inline">· {hint}</span>}
        {href && linkLabel && (
          <Link
            href={href}
            className="ms-auto inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary-soft coarse:min-h-11"
          >
            {linkLabel}
            <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          </Link>
        )}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  );
}
