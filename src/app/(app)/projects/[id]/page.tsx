import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, KanbanSquare, Plus, Columns3, Trash2, Ban, Bot, Contact } from "lucide-react";
import { DeleteProjectButton } from "@/components/delete-project-button";
import { EditProjectDialog } from "@/components/edit-project-dialog";
import { AddTasksToProjectDialog } from "@/components/add-tasks-to-project-dialog";
import { RestoreProjectButton } from "@/components/restore-project-button";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility, canAccessProject } from "@/lib/task-access";
import { getProjectMembersView } from "@/actions/projects";
import { ProjectMembers } from "@/components/project-members";
import { taskCardSelect } from "@/lib/task-select";
import { compareTasks } from "@/lib/tasks";
import { parseTaskFilters, buildTaskWhere } from "@/lib/filters";
import { loadFilterOptions } from "@/lib/filter-data";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { SwitchAccountButton } from "@/components/switch-account-button";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const project = await prisma.project.findUnique({
    where: { id: params.id },
  });
  if (!project || project.tenantId !== tenant.id) notFound();
  const isAdmin = isAdminRole(user.role);
  // Non-admins may only open projects they're involved in (member, creator,
  // or own task inside). Customer principle: they get a silent redirect with
  // a short toast — the blocking info page stays admin-only (debugging).
  if (!(await canAccessProject(user, tenant.id, project.id))) {
    if (!isAdmin) redirect("/projects?notice=project-unavailable");
    return (
      <div className="container max-w-xl py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Ban className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">{t["noAccess.project.title"]}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t["noAccess.project.text"]}</p>
        <p className="mt-4 text-sm font-medium">
          {t["noAccess.signedInAs"]
            .replace("{name}", user.name)
            .replace("{username}", user.username)}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <SwitchAccountButton returnUrl={`/projects/${project.id}`} />
          <Button asChild variant="outline">
            <Link href="/projects">{t["deleted.back"]}</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Soft-deleted → friendly "project was deleted" page (HTTP 200) instead of
  // a 404; admins additionally get a restore that also brings back the tasks
  // that were cascade-deleted with the project.
  if (project.deletedAt) {
    // Non-admins: neutral "not available", no deletion details.
    if (!isAdmin) {
      return (
        <div className="container max-w-xl py-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Ban className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">{t["noAccess.unavailableProject"]}</h1>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/projects">{t["deleted.back"]}</Link>
          </Button>
        </div>
      );
    }
    const deletedByUser = project.deletedBy
      ? await prisma.user.findUnique({ where: { id: project.deletedBy }, select: { name: true } })
      : null;
    return (
      <div className="container max-w-xl py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <Trash2 className="h-8 w-8 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold">{t["project.deleted.banner"]}</h1>
        <p className="mt-2 text-lg italic text-muted-foreground line-through">{project.name}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          {t["deleted.by"]
            .replace("{name}", deletedByUser?.name ?? "—")
            .replace("{date}", project.deletedAt.toLocaleDateString(getActiveLocale()))}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/projects">{t["deleted.back"]}</Link>
          </Button>
          {isAdmin && <RestoreProjectButton projectId={project.id} />}
        </div>
      </div>
    );
  }
  const membersView = isAdmin ? await getProjectMembersView(project.id) : null;

  const filters = parseTaskFilters(searchParams);
  const base = { projectId: project.id, ...(await taskVisibility(user, tenant.id)) };
  const where = { AND: [base, buildTaskWhere(filters)] };

  const [options, total, tasks, candidateRows] = await Promise.all([
    loadFilterOptions(user, tenant.id),
    prisma.task.count({ where: base }),
    prisma.task.findMany({ where, select: taskCardSelect }),
    // Picker: existing tasks an admin may attach to THIS project — everything
    // in the tenant that isn't already here (soft-deletes excluded by the
    // prisma extension, archived stays out of the picker).
    isAdmin
      ? prisma.task.findMany({
          where: {
            tenantId: tenant.id,
            status: { not: "Archived" },
            OR: [{ projectId: null }, { projectId: { not: project.id } }],
          },
          select: { id: true, title: true, project: { select: { name: true } } },
          orderBy: { updatedAt: "desc" },
          take: 300,
        })
      : Promise.resolve([]),
  ]);
  tasks.sort((a, b) => compareTasks(a, b));
  const candidates = candidateRows.map((c) => ({ id: c.id, title: c.title, projectName: c.project?.name ?? null }));

  return (
    <div className="container py-6">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t["projects.title"]}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="h-4 w-4 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <h1 className="text-2xl font-bold">{project.name}</h1>
          </div>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <EditProjectDialog projectId={project.id} name={project.name} description={project.description} />
          )}
          {isAdmin && (
            <DeleteProjectButton projectId={project.id} projectName={project.name} />
          )}
          {isAdminRole(user.role) && (
            <Button asChild variant="outline">
              <Link href={`/projects/${project.id}/workflow`}>
                <Columns3 className="me-1 h-4 w-4" />
                {t["workflow.edit"]}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={`/projects/${project.id}/wissen`}>
              <Bot className="me-1 h-4 w-4" />
              {t["wissen.title"]}
            </Link>
          </Button>
          {/* TOF-0782 (Tarek 28.10.2026): Leads je Projekt — gleiche Zugriffsregel wie diese Seite */}
          <Button asChild variant="outline">
            <Link href={`/projects/${project.id}/leads`}>
              <Contact className="me-1 h-4 w-4" />
              {t["leads.title"]}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/projects/${project.id}/board`}>
              <KanbanSquare className="me-1 h-4 w-4" />
              {t["projects.openBoard"]}
            </Link>
          </Button>
          {isAdmin && (
            <AddTasksToProjectDialog projectId={project.id} candidates={candidates} />
          )}
          <Button asChild>
            <Link href={`/tasks/new?project=${project.id}`}>
              <Plus className="me-1 h-4 w-4" />
              {t["nav.newTask"]}
            </Link>
          </Button>
        </div>
      </div>

      {isAdmin && membersView && (
        <div className="mb-6">
          <ProjectMembers
            projectId={project.id}
            members={membersView.members}
            candidates={membersView.candidates}
          />
        </div>
      )}

      <FilterBar
        basePath={`/projects/${project.id}`}
        projects={options.projects}
        teams={options.teams}
        users={options.users}
        tags={options.tags}
        current={filters}
        hide={["project"]}
        resultCount={tasks.length}
        totalCount={total}
      />

      {tasks.length === 0 ? (
        <EmptyState
          title={t["dashboard.empty"]}
          action={
            <Button asChild>
              <Link href={`/tasks/new?project=${project.id}`}>
                <Plus className="me-1 h-4 w-4" />
                {t["nav.newTask"]}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}
