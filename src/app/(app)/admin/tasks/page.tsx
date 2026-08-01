import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/tasks";
import { parseTaskFilters, buildTaskWhere } from "@/lib/filters";
import { loadFilterOptions } from "@/lib/filter-data";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { FilterBar } from "@/components/filter-bar";
import { SmartFilters } from "@/components/smart-filters";
import { Card } from "@/components/ui/card";
import { isAdminRole, type Locale } from "@/lib/enums";

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { user: me, tenant } = await requireTenant();
  if (!isAdminRole(me.role)) redirect("/");
  const t = getDictionary(getActiveLocale() as Locale);

  const filters = parseTaskFilters(searchParams);
  const where = { AND: [{ tenantId: tenant.id }, buildTaskWhere(filters)] };

  const [options, total, resultCount, tasks] = await Promise.all([
    loadFilterOptions(me, tenant.id),
    prisma.task.count({ where: { tenantId: tenant.id } }),
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        assignedTo: { select: { name: true } },
        project: { select: { name: true, color: true } },
        team: { select: { name: true, color: true } },
      },
      take: 200,
    }),
  ]);

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["admin.tasks.title"]}</h1>

      <SmartFilters
        presets={[
          { label: t["filters.smart.myOpen"], href: `/admin/tasks?assignee=${me.id}&status=open` },
          { label: t["filters.smart.thisWeek"], href: `/admin/tasks?date=week` },
        ]}
      />

      <FilterBar
        basePath="/admin/tasks"
        projects={options.projects}
        teams={options.teams}
        users={options.users}
        current={filters}
        resultCount={resultCount}
        totalCount={total}
      />

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-start text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{t["task.title"]}</th>
              <th className="p-3">{t["task.status"]}</th>
              <th className="p-3">{t["task.priority"]}</th>
              <th className="hidden p-3 md:table-cell">{t["task.assignee"]}</th>
              <th className="hidden p-3 lg:table-cell">{t["task.project"]}</th>
              <th className="hidden p-3 xl:table-cell">{t["task.team"]}</th>
              <th className="hidden p-3 sm:table-cell">{t["task.dueDate"]}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-secondary/30" data-testid="admin-task-row" data-task-id={task.id}>
                <td className="p-3">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                </td>
                <td className="p-3">
                  <StatusBadge status={task.status} />
                </td>
                <td className="p-3">
                  <PriorityBadge priority={task.priority} />
                </td>
                <td className="hidden p-3 md:table-cell">
                  {task.assignedTo?.name ?? t["task.unassigned"]}
                </td>
                <td className="hidden p-3 lg:table-cell">
                  {task.project ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: task.project.color }}
                      />
                      {task.project.name}
                    </span>
                  ) : (
                    t["common.none"]
                  )}
                </td>
                <td className="hidden p-3 xl:table-cell">
                  {task.team ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: task.team.color }}
                      />
                      {task.team.name}
                    </span>
                  ) : (
                    t["common.none"]
                  )}
                </td>
                <td
                  className={cn(
                    "hidden p-3 sm:table-cell",
                    isOverdue(task.dueDate, task.status as any) &&
                      "font-medium text-rose-600"
                  )}
                >
                  {task.dueDate ? format(task.dueDate, "dd.MM.yyyy") : t["common.none"]}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {t["dashboard.empty"]}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
