import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { taskCardSelect } from "@/lib/task-select";
import { parseTaskFilters, buildTaskWhere } from "@/lib/filters";
import { loadFilterOptions } from "@/lib/filter-data";
import { KanbanBoard } from "@/components/kanban-board";
import { FilterBar } from "@/components/filter-bar";

const DONE_LIMIT = 40;

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const filters = parseTaskFilters(searchParams);
  const base = {
    ...(await taskVisibility(user, tenant.id)),
    status: { in: ["Todo", "InProgress", "Done"] },
  };
  const where = { AND: [base, buildTaskWhere(filters)] };

  // TOF-0962 Tempo: offene Aufgaben vollständig, Erledigte nur die letzten 40
  // (vorher kamen alle ~500 erledigten Karten mit — 7–9 s Ladezeit).
  const [options, total, openTasks, doneTasks, doneTotal] = await Promise.all([
    loadFilterOptions(user, tenant.id),
    prisma.task.count({ where: base }),
    prisma.task.findMany({
      where: { AND: [where, { status: { in: ["Todo", "InProgress"] } }] },
      select: taskCardSelect,
      orderBy: { priority: "asc" },
    }),
    prisma.task.findMany({
      where: { AND: [where, { status: "Done" }] },
      select: taskCardSelect,
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: DONE_LIMIT,
    }),
    prisma.task.count({ where: { AND: [where, { status: "Done" }] } }),
  ]);
  const tasks = [...openTasks, ...doneTasks];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{t["board.title"]}</h1>

      <FilterBar
        basePath="/board"
        projects={options.projects}
        teams={options.teams}
        users={options.users}
        tags={options.tags}
        current={filters}
        hide={["status"]}
        resultCount={openTasks.length + doneTotal}
        totalCount={total}
      />

      <KanbanBoard initialTasks={tasks} doneTotal={doneTotal} />
    </div>
  );
}
