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
import { canEditTaskContent, taskParticipation } from "@/lib/task-access";
import { TaskForm } from "@/components/task-form";
import { describeRule, ruleInterval, ruleWeekdays } from "@/lib/recurrence";

export default async function EditTaskPage({
  params,
}: {
  params: { id: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task || task.tenantId !== tenant.id) notFound();

  // #36 — only the creator or an admin may open the content-edit form.
  if (!canEditTaskContent(user, task)) notFound();

  const [users, projects, teams, parents, assigneeRows] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Parent picker: participation-scoped; the CURRENT parent is always kept
    // selectable so an existing reference never breaks in the form.
    prisma.task.findMany({
      where: {
        type: { not: "Subtask" },
        id: { not: task.id },
        OR: [
          await taskParticipation(user, tenant.id),
          ...(task.parentId ? [{ id: task.parentId, tenantId: tenant.id }] : []),
        ],
      },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.taskAssignee.findMany({ where: { taskId: task.id }, select: { userId: true } }),
  ]);
  // #13 — co-assignees = everyone assigned except the primary (Hauptkopf)
  const coAssigneeIds = assigneeRows.map((a) => a.userId).filter((id) => id !== task.assignedToUserId);

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
          assigneeIds: coAssigneeIds,
          projectId: task.projectId,
          teamId: task.teamId,
          dueDate: task.dueDate ? format(task.dueDate, "yyyy-MM-dd") : null,
          estimatedHours:
            task.estimatedHours != null ? formatDuration(task.estimatedHours) : "",
          spentHours: task.spentHours > 0 ? formatDuration(task.spentHours) : "",
          recurrence: task.recurringCron ? "custom" : describeRule(task.recurringRule),
          recurInterval: String(ruleInterval(task.recurringRule)),
          recurWeekdays: ruleWeekdays(task.recurringRule),
          recurCron: task.recurringCron ?? "",
          recurTz: task.recurringTz ?? undefined,
          recurEndType:
            task.recurringEndCount != null
              ? "count"
              : task.recurringUntil != null
                ? "until"
                : "never",
          recurEndCount:
            task.recurringEndCount != null ? String(task.recurringEndCount) : "",
          recurUntil: task.recurringUntil
            ? format(task.recurringUntil, "yyyy-MM-dd")
            : "",
        }}
        submitLabel={t["task.save"]}
      />
    </div>
  );
}
