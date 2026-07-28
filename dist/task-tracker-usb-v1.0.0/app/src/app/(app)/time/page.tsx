import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/enums";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { addDays, dayKey, parseDayKey, weekStart } from "@/lib/timesheet";
import { fetchTimeEntries } from "@/lib/time-queries";
import { TimesheetWeek } from "@/components/timesheet-week";

export const dynamic = "force-dynamic";

export default async function TimePage({
  searchParams,
}: {
  searchParams: { week?: string; user?: string };
}) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const isAdmin = isAdminRole(user.role);

  // Admins may inspect any user's week; everyone else is locked to themselves.
  const targetUserId = isAdmin && searchParams?.user ? searchParams.user : user.id;

  const start = weekStart(parseDayKey(searchParams?.week) ?? new Date());
  const end = addDays(start, 7);

  const [entries, users, targetUser] = await Promise.all([
    fetchTimeEntries({ tenantId: tenant.id, from: start, to: end, userId: targetUserId }),
    isAdmin
      ? prisma.user.findMany({
          where: { tenantId: tenant.id },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.user.findFirst({
      where: { id: targetUserId, tenantId: tenant.id },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="container py-6">
      <h1 className="mb-6 text-2xl font-bold">{t["timesheet.title"]}</h1>
      <TimesheetWeek
        entries={entries}
        weekStartDay={dayKey(start)}
        userName={targetUser?.name ?? user.name}
        userId={targetUserId}
        tenantName={tenant.name}
        users={users}
        isAdmin={isAdmin}
        billingEnabled={tenant.billingEnabled}
      />
    </div>
  );
}
