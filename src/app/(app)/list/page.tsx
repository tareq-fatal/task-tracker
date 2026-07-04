import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { TaskTable } from "@/components/task-table";

export default async function ListPage() {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const rows = await prisma.task.findMany({
    where: { ...(await taskVisibility(user, tenant.id)), status: { not: "Archived" } },
    select: {
      id: true, title: true, status: true, priority: true, dueDate: true, storyPoints: true,
      assignedTo: { select: { name: true } },
    },
    take: 500,
  });

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["list.title"]}</h1>
      <TaskTable
        rows={rows.map((r) => ({ ...r, dueDate: r.dueDate ? r.dueDate.toISOString() : null }))}
      />
    </div>
  );
}
