import { GanttChartSquare } from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility, visibleProjectIds, canEditTaskContent } from "@/lib/task-access";
import { ZOOM_LEVELS, type ZoomLevel } from "@/lib/gantt";
import { GanttBoard, type GanttTask, type GanttDep } from "@/components/gantt-board";

export const dynamic = "force-dynamic";

export default async function GanttPage({
  searchParams,
}: {
  searchParams: { zoom?: string; project?: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const zoom: ZoomLevel = (ZOOM_LEVELS as string[]).includes(searchParams.zoom ?? "")
    ? (searchParams.zoom as ZoomLevel)
    : "week";

  // Project filter (only projects the user may see).
  const allowed = await visibleProjectIds(user, tenant.id);
  const projects = await prisma.project.findMany({
    where: { tenantId: tenant.id, ...(allowed ? { id: { in: allowed } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const projectId = searchParams.project && projects.some((p) => p.id === searchParams.project) ? searchParams.project : null;

  const rows = await prisma.task.findMany({
    where: {
      ...(await taskVisibility(user, tenant.id)),
      status: { not: "Archived" },
      ...(projectId ? { projectId } : {}),
    },
    select: {
      id: true, title: true, status: true, type: true, priority: true, progress: true,
      startDate: true, dueDate: true, createdAt: true, estimatedHours: true,
      createdByUserId: true,
      project: { select: { color: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: [{ startDate: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    take: 400,
  });

  const tasks: GanttTask[] = rows.map((x) => ({
    id: x.id,
    title: x.title,
    status: x.status,
    type: x.type,
    priority: x.priority,
    progress: x.progress,
    startDate: x.startDate ? x.startDate.toISOString() : null,
    dueDate: x.dueDate ? x.dueDate.toISOString() : null,
    createdAt: x.createdAt.toISOString(),
    estimatedHours: x.estimatedHours,
    color: x.project?.color ?? null,
    assignee: x.assignedTo?.name ?? null,
    canEdit: canEditTaskContent(user, { createdByUserId: x.createdByUserId }),
  }));

  const ids = new Set(tasks.map((x) => x.id));
  const links = await prisma.taskLink.findMany({
    where: { type: "DependsOn", taskId: { in: [...ids] }, linkedTaskId: { in: [...ids] } },
    select: { taskId: true, linkedTaskId: true },
  });
  const deps: GanttDep[] = links.map((l) => ({ taskId: l.taskId, dependsOnId: l.linkedTaskId }));

  return (
    <div className="container py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 p-2 text-white shadow-sm">
            <GanttChartSquare className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold">{t["gantt.title"]}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t["gantt.subtitle"]}</p>
          </div>
        </div>
        {projects.length > 0 && (
          <form className="flex items-center gap-2">
            <select
              name="project"
              aria-label={t["gantt.allProjects"]}
              defaultValue={projectId ?? ""}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t["gantt.allProjects"]}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input type="hidden" name="zoom" value={zoom} />
            <button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">{t["gantt.apply"]}</button>
          </form>
        )}
      </div>

      <GanttBoard tasks={tasks} deps={deps} initialZoom={zoom} />
    </div>
  );
}
