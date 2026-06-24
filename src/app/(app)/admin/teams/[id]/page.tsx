import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus, ListChecks, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskCardSelect } from "@/lib/task-select";
import { compareTasks } from "@/lib/tasks";
import { overdueCount } from "@/lib/performance";
import { TaskCard } from "@/components/task-card";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { TeamMembers } from "@/components/team-members";
import { DeleteTeamButton } from "@/components/delete-team-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function TeamDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "Admin") redirect("/");
  const t = getDictionary(getActiveLocale());

  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!team) notFound();

  const [tasks, allUsers] = await Promise.all([
    prisma.task.findMany({ where: { teamId: team.id }, select: taskCardSelect }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  tasks.sort((a, b) => compareTasks(a, b));
  const now = new Date();
  const done = tasks.filter((x) => x.status === "Done").length;
  const active = tasks.filter((x) => x.status === "InProgress").length;
  const overdue = overdueCount(tasks as any, now);

  const memberIds = new Set(team.members.map((m) => m.userId));
  const candidates = allUsers.filter((u) => !memberIds.has(u.id));
  const members = team.members.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    role: m.user.role,
  }));

  return (
    <div className="container py-6">
      <Link
        href="/admin/teams"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        {t["teams.title"]}
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5 shadow-sm">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: team.color }}
        >
          <ListChecks className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{team.name}</h1>
          {team.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {team.description}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link href={`/tasks/new?team=${team.id}`}>
              <Plus className="me-1 h-4 w-4" />
              {t["nav.newTask"]}
            </Link>
          </Button>
          <DeleteTeamButton
            teamId={team.id}
            label={t["task.delete"]}
            confirmText={`${team.name}?`}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t["teams.stats.total"]} value={tasks.length} icon={ListChecks} accent="sky" />
        <StatCard label={t["teams.stats.done"]} value={done} icon={CheckCircle2} accent="emerald" />
        <StatCard label={t["teams.stats.active"]} value={active} icon={Loader2} accent="amber" />
        <StatCard label={t["teams.stats.overdue"]} value={overdue} icon={AlertTriangle} accent={overdue > 0 ? "rose" : "sky"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Members */}
        <Card className="lg:col-span-1">
          <CardContent className="p-5">
            <TeamMembers
              teamId={team.id}
              members={members}
              candidates={candidates}
            />
          </CardContent>
        </Card>

        {/* Tasks */}
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t["projects.tasks"]} ({tasks.length})
          </h2>
          {tasks.length === 0 ? (
            <EmptyState title={t["dashboard.empty"]} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {tasks.map((task) => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
