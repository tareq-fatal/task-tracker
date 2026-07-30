import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { Repeat } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { describeSchedule } from "@/lib/recurring-describe";

// Admin overview of every recurring series in the tenant. Read-only list;
// managing a series (pause/skip/stop) happens on its task-detail page.
export default async function RecurringAdminPage() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const t = getDictionary(getActiveLocale());

  const series = await prisma.task.findMany({
    where: {
      tenantId: tenant.id,
      OR: [{ recurringRule: { not: null } }, { recurringCron: { not: null } }],
    },
    select: {
      id: true,
      title: true,
      recurringRule: true,
      recurringCron: true,
      recurringTz: true,
      recurringNextAt: true,
      recurringCount: true,
      recurringEndCount: true,
      recurringPaused: true,
      assignedTo: { select: { name: true } },
    },
    orderBy: [{ recurringPaused: "asc" }, { recurringNextAt: "asc" }],
  });

  return (
    <div className="container max-w-4xl py-6">
      <div className="mb-1 flex items-center gap-2">
        <Repeat className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        <h1 className="text-2xl font-bold">{t["recurring.admin.title"]}</h1>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{t["recurring.admin.subtitle"]}</p>

      {series.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t["recurring.admin.empty"]}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">{t["recurring.admin.template"]}</th>
                <th className="p-3 font-medium">{t["recurring.admin.schedule"]}</th>
                <th className="p-3 font-medium">{t["recurring.admin.next"]}</th>
                <th className="p-3 font-medium">{t["recurrence.spawned"]}</th>
                <th className="p-3 font-medium">{t["recurring.admin.status"]}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {series.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="p-3">
                    <Link href={`/tasks/${s.id}`} className="font-medium hover:underline">
                      {s.title}
                    </Link>
                    {s.assignedTo && (
                      <div className="text-xs text-muted-foreground">{s.assignedTo.name}</div>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {describeSchedule(s, t as unknown as Record<string, string>)}
                  </td>
                  <td className="p-3 tabular-nums text-muted-foreground">
                    {s.recurringNextAt ? format(s.recurringNextAt, "dd.MM.yyyy HH:mm") : "—"}
                  </td>
                  <td className="p-3 tabular-nums text-muted-foreground">
                    {s.recurringCount}
                    {s.recurringEndCount != null ? ` / ${s.recurringEndCount}` : ""}
                  </td>
                  <td className="p-3">
                    <span
                      className={
                        s.recurringPaused
                          ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      }
                    >
                      {s.recurringPaused ? t["recurrence.paused"] : t["recurrence.active"]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
