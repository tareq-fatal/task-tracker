import Link from "next/link";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { MarkAllReadButton } from "@/components/mark-all-read-button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Mobile-simplify 2026-08: own bottom tab "تنبيهات" — the personal
 * notification inbox as a full page. Desktop keeps the header bell (this
 * page stays reachable there via URL, it just isn't linked). Shows the
 * OWN rows only; the tenant-wide admin feed lives at /admin/notifications.
 */
export default async function NotificationsPage() {
  const user = await requireUser();
  const t = getDictionary(getActiveLocale());

  const rows = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = rows.filter((n) => !n.read).length;

  return (
    <div className="container max-w-2xl py-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {t["notif.title"]}
          {unread > 0 && (
            <span className="ms-2 rounded-full bg-[hsl(var(--brand-from)/0.15)] px-2 py-0.5 text-sm font-semibold text-[hsl(var(--primary))]">
              {unread}
            </span>
          )}
        </h1>
        {unread > 0 && <MarkAllReadButton label={t["notif.markAllRead"]} />}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t["notif.empty"]}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {rows.map((n) => (
            <li key={n.id}>
              <Link
                href={n.url ?? "#"}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 text-sm transition-colors hover:bg-secondary/50",
                  !n.read && "bg-[hsl(var(--brand-from)/0.06)]"
                )}
              >
                {!n.read && (
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--primary))]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block", !n.read && "font-medium")}>{n.title}</span>
                  {n.body && (
                    <span className="mt-0.5 block truncate whitespace-pre-line text-xs text-muted-foreground">
                      {n.body.split("\n")[0]}
                    </span>
                  )}
                </span>
                <time className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {format(n.createdAt, "dd.MM. HH:mm")}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
