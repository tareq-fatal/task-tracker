import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { isAdminRole } from "@/lib/enums";
import { taskVisibility } from "@/lib/task-access";
import { taskCardSelect } from "@/lib/task-select";
import { parseTaskFilters, buildTaskWhere } from "@/lib/filters";
import { loadFilterOptions } from "@/lib/filter-data";
import { loadBulkOptions } from "@/lib/bulk-data";
import { KanbanBoard } from "@/components/kanban-board";
import { FilterBar } from "@/components/filter-bar";

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

  const isAdmin = isAdminRole(user.role);
  const [options, bulk, total, tasks] = await Promise.all([
    loadFilterOptions(tenant.id),
    loadBulkOptions(tenant.id, isAdmin),
    prisma.task.count({ where: base }),
    prisma.task.findMany({
      where,
      select: taskCardSelect,
      orderBy: { priority: "asc" },
    }),
  ]);

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["board.title"]}</h1>

      <FilterBar
        basePath="/board"
        projects={options.projects}
        teams={options.teams}
        users={options.users}
        current={filters}
        hide={["status"]}
        resultCount={tasks.length}
        totalCount={total}
      />

      <KanbanBoard
        initialTasks={tasks}
        isAdmin={isAdmin}
        users={bulk.users}
        sprints={bulk.sprints}
        tagSuggestions={bulk.tagSuggestions}
      />
    </div>
  );
}
