import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { initials } from "@/lib/tasks";
import { isAdminRole } from "@/lib/enums";
import { NewUserDialog } from "@/components/new-user-dialog";
import { DeleteUserButton } from "@/components/delete-user-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export default async function AdminUsersPage() {
  const { user: me, tenant } = await requireTenant();
  if (!isAdminRole(me.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id },
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
          <div
            key={u.id}
            className="flex items-center gap-3 p-3 transition-colors hover:bg-secondary/40"
          >
            <Link
              href={`/admin/users/${u.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-gradient-to-br from-sky-700 to-teal-700 text-white">
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
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
            </Link>
            {u.id !== me.id && <DeleteUserButton userId={u.id} />}
          </div>
        ))}
      </Card>
    </div>
  );
}
