import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { createTaskAction } from "@/actions/tasks";
import { TaskForm } from "@/components/task-form";
import { isAdminRole } from "@/lib/enums";
import { taskParticipation } from "@/lib/task-access";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: { project?: string; team?: string; due?: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());

  const [users, projects, teams, parents] = await Promise.all([
    prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    // Parent picker: only tasks the user participates in (admins: all).
    prisma.task.findMany({ where: { ...(await taskParticipation(user, tenant.id)), type: { not: "Subtask" } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 200 }),
  ]);

  return (
    <div className="container max-w-2xl py-6">
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t["common.back"]}
      </Link>
      <h1 className="mb-6 text-2xl font-bold">{t["task.new"]}</h1>
      <TaskForm
        action={createTaskAction}
        users={users}
        projects={projects}
        teams={teams}
        parents={parents}
        canAssign={isAdminRole(user.role)}
        defaults={{
          assignedToUserId: user.id,
          projectId: searchParams.project ?? null,
          teamId: searchParams.team ?? null,
          dueDate: searchParams.due ?? null,
        }}
        submitLabel={t["task.create"]}
      />
    </div>
  );
}
