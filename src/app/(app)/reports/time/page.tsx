import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/enums";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { addDays, dayKey, parseDayKey } from "@/lib/timesheet";
import { fetchTimeEntries } from "@/lib/time-queries";
import { TimeReport, type TimeGroupBy } from "@/components/time-report";

export const dynamic = "force-dynamic";

export default async function TimeReportPage({
  searchParams,
}: {
  searchParams: { from?: string; to?: string; group?: string; user?: string; project?: string; sprint?: string };
}) {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/time");
  const t = getDictionary(getActiveLocale());

  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const from = parseDayKey(searchParams?.from) ?? addDays(today, -29);
  // `to` is inclusive in the UI; query end is exclusive midnight after it.
  const to = parseDayKey(searchParams?.to) ?? today;
  const groupBy: TimeGroupBy = ["user", "project", "sprint"].includes(searchParams?.group ?? "")
    ? (searchParams!.group as TimeGroupBy)
    : "user";

  const [entries, users, projects, sprints] = await Promise.all([
    fetchTimeEntries({
      tenantId: tenant.id,
      from,
      to: addDays(to, 1),
      userId: searchParams?.user || undefined,
      projectId: searchParams?.project || undefined,
      sprintId: searchParams?.sprint || undefined,
    }),
    prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.sprint.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="container py-6">
      <h1 className="mb-6 text-2xl font-bold">{t["timeReport.title"]}</h1>
      <TimeReport
        entries={entries}
        fromDay={dayKey(from)}
        toDay={dayKey(to)}
        groupBy={groupBy}
        filters={{
          user: searchParams?.user ?? "",
          project: searchParams?.project ?? "",
          sprint: searchParams?.sprint ?? "",
        }}
        users={users}
        projects={projects}
        sprints={sprints}
        billingEnabled={tenant.billingEnabled}
      />
    </div>
  );
}
