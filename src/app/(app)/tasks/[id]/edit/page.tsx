import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { updateTaskAction } from "@/actions/tasks";
import { TaskForm } from "@/components/task-form";
import type { Locale } from "@/lib/enums";

export default async function EditTaskPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) notFound();

  const canEdit =
    user.role === "Admin" ||
    task.createdByUserId === user.id ||
    task.assignedToUserId === user.id;
  if (!canEdit) notFound();

  const [users, projects] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
        defaults={{
          title: task.title,
          description: task.description ?? "",
          status: task.status,
          priority: task.priority,
          assignedToUserId: task.assignedToUserId,
          projectId: task.projectId,
          dueDate: task.dueDate ? format(task.dueDate, "yyyy-MM-dd") : null,
        }}
        submitLabel={t["task.save"]}
      />
    </div>
  );
}
