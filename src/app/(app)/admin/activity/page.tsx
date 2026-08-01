import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { AdminActivityFeed } from "@/components/admin-activity-feed";
import { RetentionPurgeButtons } from "@/components/retention-purge-buttons";

// #33 — tenant-wide activity feed for admins: every change users make to tasks.
export default async function AdminActivityPage() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const rows = await prisma.activityLog.findMany({
    where: { task: { tenantId: tenant.id } },
    include: {
      user: { select: { name: true } },
      task: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
    userName: r.user.name,
    taskId: r.task.id,
    taskTitle: r.task.title,
  }));

  return (
    <div className="container max-w-2xl py-6">
      <h1 className="text-2xl font-bold">{t["adminActivity.title"]}</h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        {t["adminActivity.subtitle"]}
      </p>
      <div className="mb-6">
        <RetentionPurgeButtons kind="activity" days={tenant.notificationRetentionDays} />
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t["activity.empty"]}</p>
      ) : (
        <AdminActivityFeed items={items} />
      )}
      <div className="mt-6">
        <Link href="/" className="text-sm text-muted-foreground hover:underline">
          ← {t["common.back"]}
        </Link>
      </div>
    </div>
  );
}
