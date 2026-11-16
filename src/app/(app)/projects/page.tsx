import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { EmptyState } from "@/components/empty-state";
import { visibleProjectIds } from "@/lib/task-access";
import { isAdminRole } from "@/lib/enums";

function fmt(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export default async function ProjectsPage() {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const isAdmin = isAdminRole(user.role); // #37 — only admins may create projects
  // #26: non-admins see only projects they're a member of (or have a task in)
  const allowed = await visibleProjectIds(user, tenant.id);
  const [projects, groups] = await Promise.all([
    prisma.project.findMany({
      where: {
        tenantId: tenant.id,
        ...(allowed ? { id: { in: allowed } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tasks: { where: { deletedAt: null } } } } },
    }),
    // TOF-0962: offen/erledigt je Projekt für den Fortschrittsbalken.
    prisma.task.groupBy({
      by: ["projectId", "status"],
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        projectId: allowed ? { in: allowed } : { not: null },
        status: { in: ["Todo", "InProgress", "Done"] },
      },
      _count: { _all: true },
    }),
  ]);
  const stats = new Map<string, { open: number; done: number }>();
  for (const g of groups) {
    if (!g.projectId) continue;
    const e = stats.get(g.projectId) ?? { open: 0, done: 0 };
    if (g.status === "Done") e.done += g._count._all;
    else e.open += g._count._all;
    stats.set(g.projectId, e);
  }
  // Aktive Projekte (mit offenen Aufgaben) zuerst, dann nach Anzahl offener.
  const sorted = [...projects].sort((a, b) => (stats.get(b.id)?.open ?? 0) - (stats.get(a.id)?.open ?? 0));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t["projects.title"]}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">{projects.length}</p>
        </div>
        {isAdmin && <NewProjectDialog />}
      </div>

      {projects.length === 0 ? (
        <EmptyState title={t["projects.empty"]} action={isAdmin ? <NewProjectDialog /> : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((p) => {
            const s = stats.get(p.id) ?? { open: 0, done: 0 };
            const total = s.open + s.done;
            const pct = total ? Math.round((s.done / total) * 100) : 0;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="group flex h-full flex-col rounded-xl border bg-card p-5 shadow-card transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-raised"
              >
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                  <h2 className="min-w-0 flex-1 truncate font-semibold" dir="auto">
                    {p.name}
                  </h2>
                </div>
                {p.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground" dir="auto">
                    {p.description}
                  </p>
                ) : (
                  <div className="mt-2" />
                )}
                <div className="mt-auto pt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="tabular-nums">{fmt(t["projects.openTasks"], { n: s.open })}</span>
                    <span className="tabular-nums">
                      {p._count.tasks} {t["projects.tasks"]}
                    </span>
                  </div>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={fmt(t["projects.doneShare"], { p: pct })}
                  >
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
