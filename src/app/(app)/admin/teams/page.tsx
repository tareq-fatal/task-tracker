import Link from "next/link";
import { redirect } from "next/navigation";
import { Users2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { overdueCount } from "@/lib/performance";
import { NewTeamDialog } from "@/components/new-team-dialog";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";

export default async function AdminTeamsPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "Admin") redirect("/");
  const t = getDictionary(getActiveLocale());

  const teams = await prisma.team.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { members: true } },
      tasks: { select: { status: true, dueDate: true } },
    },
  });

  const now = new Date();

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t["teams.title"]}</h1>
        <NewTeamDialog />
      </div>

      {teams.length === 0 ? (
        <EmptyState title={t["teams.empty"]} action={<NewTeamDialog />} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((team) => {
            const total = team.tasks.length;
            const done = team.tasks.filter((x) => x.status === "Done").length;
            const active = team.tasks.filter(
              (x) => x.status === "InProgress"
            ).length;
            const overdue = overdueCount(team.tasks as any, now);
            const stats = [
              { label: t["teams.stats.total"], value: total, color: "text-foreground" },
              { label: t["teams.stats.done"], value: done, color: "text-emerald-600" },
              { label: t["teams.stats.active"], value: active, color: "text-amber-600" },
              { label: t["teams.stats.overdue"], value: overdue, color: "text-rose-600" },
            ];
            return (
              <Link key={team.id} href={`/admin/teams/${team.id}`}>
                <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="mb-3 flex items-start gap-3">
                      <span
                        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: team.color }}
                      >
                        <Users2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold">{team.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {team._count.members} {t["teams.members"]}
                        </p>
                      </div>
                    </div>
                    {team.description && (
                      <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                        {team.description}
                      </p>
                    )}
                    <div className="grid grid-cols-4 gap-2 border-t pt-3">
                      {stats.map((s) => (
                        <div key={s.label} className="text-center">
                          <div
                            className={`text-lg font-bold tabular-nums ${s.color}`}
                          >
                            {s.value}
                          </div>
                          <div className="text-[10px] leading-tight text-muted-foreground">
                            {s.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
