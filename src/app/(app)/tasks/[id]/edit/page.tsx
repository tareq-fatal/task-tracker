import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { updateTaskAction } from "@/actions/tasks";
import { formatDuration } from "@/lib/tasks";
import { isAdminRole } from "@/lib/enums";
import { TaskForm } from "@/components/task-form";
import { describeRule } from "@/lib/recurrence";

export default async function EditTaskPage({
  params,
}: {
  params: { id: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task || task.tenantId !== tenant.id) notFound();

  const canEdit =
    isAdminRole(user.role) ||
    task.createdByUserId === user.id ||
    task.assignedToUserId === user.id;
  if (!canEdit) notFound();

  const [users, projects, teams, parents] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { tenantId: tenant.id, type: { not: "Subtask" }, id: { not: task.id } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
  ]);

  const action = updateTaskAction.bind(null, task.id);

  return (
    <div className="container max-w-2xl py-6">
      <Link
        href={`/tasks/${task.id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t["common.back"]}
      </Link>
      <h1 className="mb-6 text-2xl font-bold">{t["task.edit"]}</h1>
      <TaskForm
        action={action}
        users={users}
        projects={projects}
        teams={teams}
        parents={parents}
        canAssign={isAdminRole(user.role)}
        isEdit
        defaults={{
          title: task.title,
          description: task.description ?? "",
          status: task.status,
          priority: task.priority,
          type: task.type,
          storyPoints: task.storyPoints != null ? String(task.storyPoints) : "",
          parentId: task.parentId,
          assignedToUserId: task.assignedToUserId,
          projectId: task.projectId,
          teamId: task.teamId,
          dueDate: task.dueDate ? format(task.dueDate, "yyyy-MM-dd") : null,
          estimatedHours:
            task.estimatedHours != null ? formatDuration(task.estimatedHours) : "",
          spentHours: task.spentHours > 0 ? formatDuration(task.spentHours) : "",
          recurrence: describeRule(task.recurringRule),
        }}
        submitLabel={t["task.save"]}
      />
    </div>
  );
}
