import Link from "next/link";
import { Rocket, Plus } from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility, visibleProjectIds } from "@/lib/task-access";
import { laneRange, pct, roadmapWindow, ZOOMS, type Zoom } from "@/lib/roadmap";
import { cn } from "@/lib/utils";
import { RoadmapView, type Lane } from "@/components/roadmap-view";
import { TimelineTabs } from "@/components/timeline-tabs";

// Distinct lane colours (epics have no project colour of their own)
const PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f43f5e"];

export default async function RoadmapPage({ searchParams }: { searchParams: { zoom?: string } }) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const now = Date.now();
  const iso = (d: Date) => d.toISOString();
  const zoom: Zoom = (ZOOMS as string[]).includes(searchParams.zoom ?? "") ? (searchParams.zoom as Zoom) : "auto";

  // Primary lanes = Epics with their child tasks; fall back to projects.
  const epics = await prisma.task.findMany({
    where: { ...(await taskVisibility(user, tenant.id)), type: "Epic" },
    select: { id: true, title: true, priority: true, createdAt: true, dueDate: true, project: { select: { color: true } } },
  });

  let lanes: Lane[] = [];
  if (epics.length > 0) {
    const children = await prisma.task.findMany({
      where: { tenantId: tenant.id, parentId: { in: epics.map((e) => e.id) } },
      select: { parentId: true, status: true, createdAt: true, dueDate: true },
    });
    lanes = epics.map((e, i) => {
      const kids = children.filter((c) => c.parentId === e.id);
      const all = [{ createdAt: iso(e.createdAt), dueDate: e.dueDate ? iso(e.dueDate) : null }, ...kids.map((c) => ({ createdAt: iso(c.createdAt), dueDate: c.dueDate ? iso(c.dueDate) : null }))];
      const { start, end } = laneRange(all, now);
      const done = kids.filter((c) => c.status === "Done" || c.status === "Archived").length;
      return { id: e.id, title: e.title, kind: "Epic" as const, color: e.project?.color ?? PALETTE[i % PALETTE.length], priority: e.priority, start, end, total: kids.length, done, pct: pct(done, kids.length) };
    });
  } else {
    // #25 — non-admins only see roadmap lanes for projects they can access
    // (member of, or with a task assigned to them). Admins see all.
    const allowed = await visibleProjectIds(user, tenant.id);
    const projects = await prisma.project.findMany({
      where: { tenantId: tenant.id, ...(allowed ? { id: { in: allowed } } : {}) },
      select: { id: true, name: true, color: true },
    });
    const tasks = await prisma.task.findMany({
      where: { ...(await taskVisibility(user, tenant.id)), projectId: { in: projects.map((p) => p.id) } },
      select: { projectId: true, status: true, createdAt: true, dueDate: true },
    });
    lanes = projects.map((p, i) => {
      const pts = tasks.filter((x) => x.projectId === p.id);
      const { start, end } = laneRange(pts.map((c) => ({ createdAt: iso(c.createdAt), dueDate: c.dueDate ? iso(c.dueDate) : null })), now);
      const done = pts.filter((c) => c.status === "Done" || c.status === "Archived").length;
      return { id: p.id, title: p.name, kind: "Project" as const, color: p.color ?? PALETTE[i % PALETTE.length], priority: null, start, end, total: pts.length, done, pct: pct(done, pts.length) };
    });
  }

  lanes = lanes.filter((l) => l.total > 0 || l.kind === "Epic");
  const { from, to } = roadmapWindow(lanes, now, zoom);

  const zoomTab = (z: Zoom, label: string) => (
    <Link href={`/roadmap?zoom=${z}`} className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", zoom === z ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
      {label}
    </Link>
  );

  return (
    <div className="container py-6">
      <TimelineTabs active="roadmap" labels={{ gantt: t["nav.gantt"], roadmap: t["nav.roadmap"] }} />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t["roadmap.title"]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t["roadmap.subtitle"]}</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {zoomTab("3m", "3M")}{zoomTab("6m", "6M")}{zoomTab("1y", "1Y")}{zoomTab("3y", "3Y")}{zoomTab("auto", t["roadmap.autoZoom"])}
        </div>
      </div>

      {lanes.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-12 text-center">
          <Rocket className="mx-auto mb-3 h-10 w-10 text-indigo-300" />
          <p className="text-sm font-medium">{t["roadmap.empty"]}</p>
          <Link href="/tasks/new" className="mt-4 inline-flex items-center gap-1 rounded-lg brand-gradient px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
            <Plus className="h-4 w-4" /> {t["roadmap.addEpic"]}
          </Link>
        </div>
      ) : (
        <RoadmapView lanes={lanes} from={from} to={to} now={now} doneLabel={t["roadmap.done"]} />
      )}
    </div>
  );
}
