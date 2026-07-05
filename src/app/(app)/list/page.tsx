import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { isAdminRole } from "@/lib/enums";
import { taskVisibility } from "@/lib/task-access";
import { loadBulkOptions } from "@/lib/bulk-data";
import { TaskTable } from "@/components/task-table";

export default async function ListPage() {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const isAdmin = isAdminRole(user.role);

  const [rows, bulk] = await Promise.all([
    prisma.task.findMany({
      where: { ...(await taskVisibility(user, tenant.id)), status: { not: "Archived" } },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true, storyPoints: true,
        assignedTo: { select: { name: true } },
        tags: { select: { tag: { select: { name: true, color: true } } } },
      },
      take: 500,
    }),
    loadBulkOptions(tenant.id, isAdmin),
  ]);

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["list.title"]}</h1>
      <TaskTable
        rows={rows.map((r) => ({ ...r, dueDate: r.dueDate ? r.dueDate.toISOString() : null }))}
        isAdmin={isAdmin}
        users={bulk.users}
        sprints={bulk.sprints}
        tagSuggestions={bulk.tagSuggestions}
      />
    </div>
  );
}
