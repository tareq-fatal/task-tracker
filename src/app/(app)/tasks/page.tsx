import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { taskCardSelect } from "@/lib/task-select";
import { compareTasks } from "@/lib/tasks";
import { loadFilterOptions } from "@/lib/filter-data";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { FocusTabs, type FocusView } from "@/components/focus-tabs";

const VIEWS: FocusView[] = ["all", "person", "team", "project", "operations"];

export default async function FocusPage({ searchParams }: { searchParams: { view?: string; id?: string } }) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const view: FocusView = VIEWS.includes(searchParams.view as FocusView) ? (searchParams.view as FocusView) : "all";
  const id = searchParams.id ?? null;

  const options = await loadFilterOptions(tenant.id);

  // Every query stays tenant-scoped via taskVisibility; a crafted foreign id
  // simply matches nothing (tasks are tenant-scoped), so isolation holds.
  const base = taskVisibility(user, tenant.id);
  let where: Record<string, unknown> = { ...base, status: { not: "Archived" } };
  if (view === "person" && id) where = { ...base, assignedToUserId: id };
  else if (view === "team" && id) where = { ...base, teamId: id };
  else if (view === "project" && id) where = { ...base, projectId: id };
  else if (view === "operations") where = { ...base, status: "InProgress" };

  const tasks = await prisma.task.findMany({ where, select: taskCardSelect, take: 300 });
  tasks.sort((a, b) => (view === "operations" ? 0 : compareTasks(a, b)));

  const needsPick = (view === "person" || view === "team" || view === "project") && !id;

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["focus.title"]}</h1>
      <FocusTabs view={view} id={id} users={options.users} teams={options.teams} projects={options.projects} />

      {view === "operations" && (
        <p className="mb-3 text-sm font-medium text-muted-foreground">
          {t["focus.now"]} · <span className="font-bold text-foreground">{tasks.length}</span>
        </p>
      )}

      {needsPick ? (
        <EmptyState title={t["focus.pick"]} />
      ) : tasks.length === 0 ? (
        <EmptyState title={t["focus.empty"]} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => <TaskCard key={task.id} task={task} />)}
        </div>
      )}
    </div>
  );
}
