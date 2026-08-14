import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibility } from "@/lib/task-access";
import { parseOptions, type FieldType } from "@/lib/custom-fields";
import { isImageMime } from "@/lib/attachment-view";
import { TaskTable, type CustomCol } from "@/components/task-table";

export default async function ListPage() {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const [rows, defs] = await Promise.all([
    prisma.task.findMany({
      where: { ...(await taskVisibility(user, tenant.id)), status: { not: "Archived" } },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true, storyPoints: true,
        assignedTo: { select: { name: true } },
        project: { select: { name: true, color: true } },
        // Miniaturen in der Liste — bis zu drei Bilder je Zeile.
        attachments: {
          where: { deletedAt: null, mimeType: { startsWith: "image/" } },
          orderBy: { uploadedAt: "asc" },
          take: 3,
          select: { id: true, fileName: true, mimeType: true },
        },
        customValues: { select: { fieldId: true, value: true } },
      },
      take: 500,
    }),
    prisma.customFieldDef.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const customFields: CustomCol[] = defs.map((d) => ({
    id: d.id, name: d.name, type: d.type as FieldType, options: parseOptions(d.options),
  }));

  // Resolve user ids → names for any `user`-type column.
  const userNames: Record<string, string> = {};
  if (defs.some((d) => d.type === "user")) {
    const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true } });
    for (const u of users) userNames[u.id] = u.name;
  }

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["list.title"]}</h1>
      <TaskTable
        rows={rows.map((r) => ({
          id: r.id, title: r.title, status: r.status, priority: r.priority,
          dueDate: r.dueDate ? r.dueDate.toISOString() : null, storyPoints: r.storyPoints,
          assignedTo: r.assignedTo,
          project: r.project,
          // SVG bleibt außen vor (wird nirgends inline gerendert).
          images: r.attachments
            .filter((a) => isImageMime(a.mimeType))
            .map((a) => ({ id: a.id, fileName: a.fileName })),
          custom: Object.fromEntries(r.customValues.map((v) => [v.fieldId, v.value])),
        }))}
        customFields={customFields}
        userNames={userNames}
        canDelete={isAdminRole(user.role)}
      />
    </div>
  );
}
