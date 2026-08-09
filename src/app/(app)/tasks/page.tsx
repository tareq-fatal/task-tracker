import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { isAdminRole } from "@/lib/enums";
import { taskCardSelect } from "@/lib/task-select";
import { compareTasks } from "@/lib/tasks";
import { personInvolvedWhere } from "@/lib/filters";
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
  // Person view = the task appears if the person is attached in ANY role
  // (Hauptkopf, co-assignee, creator) — not just as the primary assignee.
  // AND keeps `base`'s own OR (non-admin visibility) intact.
  if (view === "person" && id) where = { AND: [base, personInvolvedWhere(id)] };
  else if (view === "team" && id) where = { ...base, teamId: id };
  else if (view === "project" && id) where = { ...base, projectId: id };

  // Role fields power the "why am I seeing this" chips in the person view.
  const select = {
    ...taskCardSelect,
    assignedToUserId: true,
    createdByUserId: true,
    assignees: { select: { userId: true } },
  } as const;
  const tasks = await prisma.task.findMany({ where, select, take: 300 });
  tasks.sort((a, b) => compareTasks(a, b));

  // Which role(s) attach the filtered person to a task (person view only).
  // The Hauptkopf is mirrored into TaskAssignee, so "co" only counts when
  // the person is NOT already the lead.
  const rolesFor = (task: (typeof tasks)[number]): string[] => {
    if (view !== "person" || !id) return [];
    const roles: string[] = [];
    if (task.assignedToUserId === id) roles.push(t["focus.role.lead"]);
    else if (task.assignees.some((a) => a.userId === id)) roles.push(t["focus.role.co"]);
    if (task.createdByUserId === id) roles.push(t["focus.role.creator"]);
    return roles;
  };

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
          {tasks.map((task) => {
            const roles = rolesFor(task);
            return (
              <div key={task.id}>
                {roles.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {roles.map((r) => (
                      <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
                <TaskCard task={task} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
