import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { taskVisibility } from "@/lib/task-access";
import { cn } from "@/lib/utils";
import { CalendarView } from "@/components/calendar-view";
import { GanttChart } from "@/components/gantt-chart";

const DAY = 24 * 60 * 60 * 1000;

export default async function ViewsPage({
  searchParams,
}: {
  searchParams: { view?: string; project?: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const view = ["calendar", "gantt", "timeline"].includes(searchParams.view ?? "")
    ? (searchParams.view as "calendar" | "gantt" | "timeline")
    : "calendar";

  const projects = await prisma.project.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const projectId = searchParams.project && projects.some((p) => p.id === searchParams.project) ? searchParams.project : null;

  const tasks = await prisma.task.findMany({
    where: {
      ...taskVisibility(user, tenant.id),
      status: { not: "Archived" },
      ...(projectId ? { projectId } : {}),
    },
    select: { id: true, title: true, status: true, type: true, dueDate: true, createdAt: true },
    take: 400,
  });

  const now = new Date();
  const calendarTasks = tasks.map((x) => ({
    id: x.id, title: x.title, status: x.status, type: x.type,
    dueDate: x.dueDate ? x.dueDate.toISOString().slice(0, 10) : null,
  }));

  // gantt/timeline: scheduled tasks (have a due date)
  const scheduled = tasks.filter((x) => x.dueDate);
  const ganttTasks = scheduled.map((x) => ({
    id: x.id, title: x.title, status: x.status, type: x.type,
    start: x.createdAt.toISOString(),
    end: x.dueDate!.toISOString(),
  }));
  const ids = new Set(scheduled.map((x) => x.id));
  const links = view === "calendar" ? [] : await prisma.taskLink.findMany({
    where: { type: "DependsOn", taskId: { in: [...ids] }, linkedTaskId: { in: [...ids] } },
    select: { taskId: true, linkedTaskId: true },
  });
  const deps = links.map((l) => ({ taskId: l.taskId, dependsOnId: l.linkedTaskId }));

  const ganttWindow = { from: new Date(now.getTime() - 30 * DAY).toISOString(), to: new Date(now.getTime() + 90 * DAY).toISOString() };
  const timelineWindow = { from: new Date(now.getTime() - 60 * DAY).toISOString(), to: new Date(now.getTime() + 300 * DAY).toISOString() };

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
        {tab("calendar", t["view.calendar"])}
        {tab("gantt", t["view.gantt"])}
        {tab("timeline", t["view.timeline"])}
        <form className="ms-auto">
          <select
            name="project"
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

      {view === "calendar" && <CalendarView tasks={calendarTasks} />}
      {view === "gantt" && (
        ganttTasks.length ? <GanttChart tasks={ganttTasks} deps={deps} from={ganttWindow.from} to={ganttWindow.to} mode="gantt" />
          : <p className="text-sm text-muted-foreground">{t["views.unscheduled"]}</p>
      )}
      {view === "timeline" && (
        ganttTasks.length ? <GanttChart tasks={ganttTasks} deps={deps} from={timelineWindow.from} to={timelineWindow.to} mode="timeline" />
          : <p className="text-sm text-muted-foreground">{t["views.unscheduled"]}</p>
      )}
    </div>
  );
}
