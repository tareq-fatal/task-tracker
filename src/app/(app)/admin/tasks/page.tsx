import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { isOverdue } from "@/lib/tasks";
import { StatusBadge, PriorityBadge } from "@/components/task-badges";
import { SearchBox } from "@/components/search-box";
import { Card } from "@/components/ui/card";
import { TASK_STATUSES, type Locale } from "@/lib/enums";

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "Admin") redirect("/");
  const t = getDictionary(getActiveLocale());

  const q = searchParams.q?.trim();
  const status = searchParams.status;

  const where: any = {};
  if (q) where.title = { contains: q };
  if (status && (TASK_STATUSES as readonly string[]).includes(status)) {
    where.status = status;
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      assignedTo: { select: { name: true } },
      project: { select: { name: true, color: true } },
    },
    take: 200,
  });

  const filters: { key: string; label: string }[] = [
    { key: "", label: t["common.all"] },
    ...TASK_STATUSES.map((s) => ({ key: s as string, label: t[`status.${s}`] })),
  ];

  return (
    <div className="container py-6">
      <h1 className="mb-4 text-2xl font-bold">{t["admin.tasks.title"]}</h1>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => {
            const active = (status ?? "") === f.key;
            const href =
              "/admin/tasks" +
              (f.key ? `?status=${f.key}` : "") +
              (q ? `${f.key ? "&" : "?"}q=${encodeURIComponent(q)}` : "");
            return (
              <Link
                key={f.key || "all"}
                href={href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
        <SearchBox />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-start text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{t["task.title"]}</th>
              <th className="p-3">{t["task.status"]}</th>
              <th className="p-3">{t["task.priority"]}</th>
              <th className="hidden p-3 md:table-cell">{t["task.assignee"]}</th>
              <th className="hidden p-3 lg:table-cell">{t["task.project"]}</th>
              <th className="hidden p-3 sm:table-cell">{t["task.dueDate"]}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tasks.map((task) => (
              <tr key={task.id} className="hover:bg-secondary/30">
                <td className="p-3">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                </td>
                <td className="p-3">
                  <StatusBadge status={task.status} />
                </td>
                <td className="p-3">
                  <PriorityBadge priority={task.priority} />
                </td>
                <td className="hidden p-3 md:table-cell">
                  {task.assignedTo?.name ?? t["task.unassigned"]}
                </td>
                <td className="hidden p-3 lg:table-cell">
                  {task.project ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: task.project.color }}
                      />
                      {task.project.name}
                    </span>
                  ) : (
                    t["common.none"]
                  )}
                </td>
                <td
                  className={cn(
                    "hidden p-3 sm:table-cell",
                    isOverdue(task.dueDate, task.status as any) &&
                      "font-medium text-rose-600"
                  )}
                >
                  {task.dueDate ? format(task.dueDate, "dd.MM.yyyy") : t["common.none"]}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  {t["dashboard.empty"]}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
