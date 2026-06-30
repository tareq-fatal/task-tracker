import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { laneRange, pct } from "@/lib/roadmap";
import { RoadmapView, type Lane } from "@/components/roadmap-view";

const DAY = 86400000;

export default async function RoadmapPage() {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const now = Date.now();
  const iso = (d: Date) => d.toISOString();

  // Primary lanes = Epics with their child tasks; fall back to projects.
  const epics = await prisma.task.findMany({
    where: { ...taskVisibility(user, tenant.id), type: "Epic" },
    select: { id: true, title: true, createdAt: true, dueDate: true },
  });

  let lanes: Lane[] = [];
  if (epics.length > 0) {
    const children = await prisma.task.findMany({
      where: { tenantId: tenant.id, parentId: { in: epics.map((e) => e.id) } },
      select: { parentId: true, status: true, createdAt: true, dueDate: true },
    });
    lanes = epics.map((e) => {
      const kids = children.filter((c) => c.parentId === e.id);
      const all = [{ createdAt: iso(e.createdAt), dueDate: e.dueDate ? iso(e.dueDate) : null }, ...kids.map((c) => ({ createdAt: iso(c.createdAt), dueDate: c.dueDate ? iso(c.dueDate) : null }))];
      const { start, end } = laneRange(all, now);
      const done = kids.filter((c) => c.status === "Done" || c.status === "Archived").length;
      return { id: e.id, title: e.title, kind: "Epic" as const, start, end, total: kids.length, done, pct: pct(done, kids.length) };
    });
  } else {
    const projects = await prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
    const tasks = await prisma.task.findMany({
      where: { ...taskVisibility(user, tenant.id), projectId: { in: projects.map((p) => p.id) } },
      select: { projectId: true, status: true, createdAt: true, dueDate: true },
    });
    lanes = projects.map((p) => {
      const pts = tasks.filter((x) => x.projectId === p.id);
      const { start, end } = laneRange(pts.map((c) => ({ createdAt: iso(c.createdAt), dueDate: c.dueDate ? iso(c.dueDate) : null })), now);
      const done = pts.filter((c) => c.status === "Done" || c.status === "Archived").length;
      return { id: p.id, title: p.name, kind: "Project" as const, start, end, total: pts.length, done, pct: pct(done, pts.length) };
    });
  }

  lanes = lanes.filter((l) => l.total > 0 || l.kind === "Epic");
  const from = lanes.length ? Math.min(...lanes.map((l) => l.start)) - 14 * DAY : now;
  const to = lanes.length ? Math.max(...lanes.map((l) => l.end)) + 14 * DAY : now + 90 * DAY;

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold">{t["roadmap.title"]}</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">{t["roadmap.subtitle"]}</p>
      {lanes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t["roadmap.empty"]}</p>
      ) : (
        <RoadmapView lanes={lanes} from={from} to={to} doneLabel={t["roadmap.done"]} />
      )}
    </div>
  );
}
