import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { taskVisibility } from "@/lib/task-access";
import { cn } from "@/lib/utils";
import { CalendarView } from "@/components/calendar-view";
import { ScrumBoard, type ScrumTask } from "@/components/scrum-board";
import { scopedProjectOptions } from "@/lib/filter-data";

export default async function ViewsPage({
  searchParams,
}: {
  searchParams: { view?: string; project?: string };
}) {
  // Gantt/timeline used to be tabs here too — that duplicated the dedicated
  // /gantt page. The consolidated "الجدول الزمني" view owns them now.
  if (searchParams.view === "gantt" || searchParams.view === "timeline") redirect("/gantt");
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const view = searchParams.view === "scrum" ? "scrum" : "calendar";

  const projects = await scopedProjectOptions(user, tenant.id);
  const projectId = searchParams.project && projects.some((p) => p.id === searchParams.project) ? searchParams.project : null;

  const tasks = await prisma.task.findMany({
    where: {
      ...(await taskVisibility(user, tenant.id)),
      status: { not: "Archived" },
      ...(projectId ? { projectId } : {}),
    },
    select: {
      id: true, title: true, status: true, type: true, dueDate: true, createdAt: true,
      scrumColumn: true, storyPoints: true, assignedTo: { select: { name: true } },
    },
    take: 400,
  });

  // Scrum-board data (sticky cards + active-sprint header + team)
  const scrumTasks: ScrumTask[] = tasks.map((x) => ({
    id: x.id, title: x.title, type: x.type, status: x.status,
    scrumColumn: x.scrumColumn, storyPoints: x.storyPoints,
    code: `TT-${x.id.slice(-4).toUpperCase()}`,
    assignee: x.assignedTo?.name ?? null,
  }));
  const activeSprint = projectId
    ? await prisma.sprint.findFirst({ where: { tenantId: tenant.id, projectId, status: "active" } })
    : null;
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" }) : "");
  const sprintHeader = activeSprint
    ? { name: activeSprint.name, range: activeSprint.startDate && activeSprint.endDate ? `${fmt(activeSprint.startDate)} – ${fmt(activeSprint.endDate)}` : "", goal: activeSprint.goal }
    : null;
  const teamUsers = await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { name: true }, orderBy: { name: "asc" }, take: 20 });

  const calendarTasks = tasks.map((x) => ({
    id: x.id, title: x.title, status: x.status, type: x.type,
    dueDate: x.dueDate ? x.dueDate.toISOString().slice(0, 10) : null,
  }));

  const tab = (v: string, label: string) => (
    <Link
      href={`/views?view=${v}${projectId ? `&project=${projectId}` : ""}`}
      className={cn("rounded-full px-3 py-1 text-sm font-medium transition-colors", view === v ? "bg-indigo-100 text-indigo-700" : "text-muted-foreground hover:bg-muted")}
    >
      {label}
    </Link>
  );

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["views.title"]}</h1>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tab("scrum", t["view.scrum"])}
        {tab("calendar", t["view.calendar"])}
        <form className="ms-auto">
          <select
            name="project"
            aria-label={t["views.allProjects"]}
            defaultValue={projectId ?? ""}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            // server-side: rely on links instead; simple GET form
          >
            <option value="">{t["views.allProjects"]}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input type="hidden" name="view" value={view} />
          <button className="ms-2 rounded-md border px-2 py-1 text-sm hover:bg-muted">{t["views.apply"]}</button>
        </form>
      </div>

      {view === "scrum" && (
        <ScrumBoard tasks={scrumTasks} sprint={sprintHeader} team={teamUsers.map((u) => u.name)} meName={user.name} />
      )}
      {view === "calendar" && <CalendarView tasks={calendarTasks} />}
    </div>
  );
}
