import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { isAdminRole } from "@/lib/enums";
import { taskCardSelect } from "@/lib/task-select";
import { compareTasks } from "@/lib/tasks";
import { loadFilterOptions } from "@/lib/filter-data";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { FocusTabs, type FocusView } from "@/components/focus-tabs";
import { SavedViews } from "@/components/saved-views";
import { getMySavedViews } from "@/actions/saved-views";

const VIEWS: FocusView[] = ["all", "person", "team", "project"];

export default async function FocusPage({ searchParams }: { searchParams: { view?: string; id?: string } }) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/"); // Focus is admin-only
  const t = getDictionary(getActiveLocale());
  const view: FocusView = VIEWS.includes(searchParams.view as FocusView) ? (searchParams.view as FocusView) : "all";
  const id = searchParams.id ?? null;

  const [options, savedViews] = await Promise.all([loadFilterOptions(user, tenant.id), getMySavedViews()]);

  // Every query stays tenant-scoped via taskVisibility; a crafted foreign id
  // simply matches nothing (tasks are tenant-scoped), so isolation holds.
  const base = await taskVisibility(user, tenant.id);
  let where: Record<string, unknown> = { ...base, status: { not: "Archived" } };
  if (view === "person" && id) where = { ...base, assignedToUserId: id };
  else if (view === "team" && id) where = { ...base, teamId: id };
  else if (view === "project" && id) where = { ...base, projectId: id };

  const tasks = await prisma.task.findMany({ where, select: taskCardSelect, take: 300 });
  tasks.sort((a, b) => compareTasks(a, b));

  const needsPick = (view === "person" || view === "team" || view === "project") && !id;

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["focus.title"]}</h1>
      <FocusTabs view={view} id={id} users={options.users} teams={options.teams} projects={options.projects} canInfographic={isAdminRole(user.role)} />
      <SavedViews saved={savedViews} view={view} entityId={id} />

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
