import { redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { initials } from "@/lib/tasks";
import { NewUserDialog } from "@/components/new-user-dialog";
import { DeleteUserButton } from "@/components/delete-user-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Locale } from "@/lib/enums";

export default async function AdminUsersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "Admin") redirect("/");
  const t = getDictionary(getActiveLocale());

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { assignedTasks: true, createdTasks: true } },
    },
  });

  return (
    <div className="container py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t["admin.users.title"]}</h1>
        <NewUserDialog />
      </div>

      <Card className="divide-y overflow-hidden">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {initials(u.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{u.name}</span>
                <Badge variant={u.role === "Admin" ? "default" : "secondary"}>
                  {u.role}
                </Badge>
              </div>
              <p className="truncate text-sm text-muted-foreground">
                @{u.username} · {u.email}
              </p>
            </div>
            <div className="hidden text-end text-xs text-muted-foreground sm:block">
              <p>
                {u._count.assignedTasks} {t["projects.tasks"].toLowerCase()}
              </p>
              <p>
                {t["admin.users.lastActive"]}:{" "}
                {format(u.lastActiveAt, "dd.MM.yyyy HH:mm")}
              </p>
            </div>
            {u.id !== me.id && <DeleteUserButton userId={u.id} />}
          </div>
        ))}
      </Card>
    </div>
  );
}
