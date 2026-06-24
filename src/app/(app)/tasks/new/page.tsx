import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { createTaskAction } from "@/actions/tasks";
import { TaskForm } from "@/components/task-form";
import type { Locale } from "@/lib/enums";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: { project?: string; team?: string };
}) {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());

  const [users, projects, teams] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
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
        defaults={{
          assignedToUserId: user.id,
          projectId: searchParams.project ?? null,
          teamId: searchParams.team ?? null,
        }}
        submitLabel={t["task.create"]}
      />
    </div>
  );
}
