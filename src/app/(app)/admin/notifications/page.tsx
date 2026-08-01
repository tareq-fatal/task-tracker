import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing } from "lucide-react";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary, type TKey } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { NOTIFICATION_EVENTS } from "@/lib/notifications-core";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button } from "@/components/ui/button";
import { RetentionPurgeButtons } from "@/components/retention-purge-buttons";

export const dynamic = "force-dynamic";

const PAGE = 50;

/** Admin-only tenant-wide notification feed: every event that was delivered
 *  to ANY user of the tenant, newest first — who assigned what to whom, who
 *  commented, mentions, first-open read receipts, deadline warnings. */
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: { user?: string; type?: string; before?: string; take?: string };
}) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const take = Math.min(Number(searchParams.take) || PAGE, 500);
  const filterUser = searchParams.user || undefined;
  const filterType =
    searchParams.type && (NOTIFICATION_EVENTS as readonly string[]).includes(searchParams.type)
      ? searchParams.type
      : undefined;
  const before = searchParams.before ? new Date(searchParams.before) : undefined;

  const [users, rows] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.notification.findMany({
      where: {
        tenantId: tenant.id,
        ...(filterUser ? { userId: filterUser } : {}),
        ...(filterType ? { type: filterType } : {}),
        ...(before && !isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (filterUser) p.set("user", filterUser);
    if (filterType) p.set("type", filterType);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="container max-w-4xl py-6">
      <AutoRefresh seconds={30} />
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <BellRing className="h-6 w-6 text-indigo-600" />
        {t["adminNotif.title"]}
      </h1>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">{t["adminNotif.subtitle"]}</p>

      <div className="mb-4">
        <RetentionPurgeButtons kind="notifications" days={tenant.notificationRetentionDays} />
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <select name="user" defaultValue={filterUser ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">{t["adminNotif.allUsers"]}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <select name="type" defaultValue={filterType ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm">
          <option value="">{t["adminNotif.allTypes"]}</option>
          {NOTIFICATION_EVENTS.map((ev) => (
            <option key={ev} value={ev}>{t[`notif.ev.${ev}` as TKey] ?? ev}</option>
          ))}
        </select>
        <input type="date" name="before" defaultValue={searchParams.before ?? ""} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
        <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">{t["adminNotif.apply"]}</button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t["adminNotif.empty"]}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((n) => (
            <li key={n.id}>
              <Link
                href={n.url ?? "#"}
                className="flex items-start gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-secondary/50"
              >
                <span className="mt-0.5 shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {(t[`notif.ev.${n.type}` as TKey] as string) ?? n.type}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{n.title}</span>
                  {n.body && (
                    <span className="block truncate whitespace-pre-line text-xs text-muted-foreground">
                      {n.body.split("\n")[0]}
                    </span>
                  )}
                  <span className="block text-[11px] text-muted-foreground/70">
                    → {n.user.name}
                  </span>
                </span>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {format(n.createdAt, "dd.MM. HH:mm")}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows.length === take && (
        <div className="mt-4 text-center">
          <Button asChild variant="outline">
            <Link href={qs({ before: rows[rows.length - 1].createdAt.toISOString() })}>
              {t["adminNotif.loadMore"]}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
