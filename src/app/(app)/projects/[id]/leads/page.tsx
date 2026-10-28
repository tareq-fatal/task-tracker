import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary, type TKey } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { canAccessProject, taskVisibilityClause } from "@/lib/task-access";
import { LEAD_STATUSES, LEAD_STATUS_CHIP, isLeadStatus, parseLeadFilter, sortLeads } from "@/lib/leads";
import { setLeadArchivedAction } from "@/actions/leads";
import { LeadForm } from "@/components/lead-form";
import { StatusBadge } from "@/components/task-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Leads je Projekt (TOF-0782, Tarek 28.10.2026). Sehen/bearbeiten: wer das
// Projekt öffnen darf (canAccessProject). Jede Lead-Abfrage filtert nach
// tenantId UND projectId; verknüpfte Aufgaben nur, soweit sichtbar
// (taskVisibilityClause). ?status=…&archived=1&edit=<leadId>
export const dynamic = "force-dynamic";

type SP = { status?: string; archived?: string; edit?: string };

export default async function LeadsPage({ params, searchParams }: { params: { id: string }; searchParams: SP }) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const projekt = await prisma.project.findFirst({
    where: { id: params.id, tenantId: tenant.id, deletedAt: null },
    select: { id: true, name: true, color: true },
  });
  if (!projekt || !(await canAccessProject(user, tenant.id, projekt.id))) notFound();

  const filter = parseLeadFilter(searchParams);
  const rows = await prisma.lead.findMany({
    where: {
      tenantId: tenant.id,
      projectId: projekt.id,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.showArchived ? {} : { archivedAt: null }),
    },
  });
  const leads = sortLeads(rows);

  const editLead = searchParams.edit
    ? await prisma.lead.findFirst({ where: { id: searchParams.edit, tenantId: tenant.id, projectId: projekt.id } })
    : null;

  // Verknüpfte Aufgaben — nur sichtbare, nur aus diesem Projekt.
  const tasks = leads.length
    ? await prisma.task.findMany({
        where: {
          AND: [
            taskVisibilityClause(user, tenant.id),
            { projectId: projekt.id, leadId: { in: leads.map((l) => l.id) } },
          ],
        },
        select: { id: true, title: true, status: true, leadId: true },
        orderBy: { updatedAt: "desc" },
      })
    : [];
  const tasksByLead = new Map<string, typeof tasks>();
  for (const task of tasks) {
    if (!task.leadId) continue;
    tasksByLead.set(task.leadId, [...(tasksByLead.get(task.leadId) ?? []), task]);
  }

  const base = `/projects/${projekt.id}/leads`;
  const href = (p: { status?: string | null; archived?: boolean }) => {
    const q = new URLSearchParams();
    const status = p.status === undefined ? filter.status : p.status;
    const archived = p.archived === undefined ? filter.showArchived : p.archived;
    if (status) q.set("status", status);
    if (archived) q.set("archived", "1");
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const listHref = href({});
  const today = new Date(new Date().toISOString().slice(0, 10));
  const chip = "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors";

  return (
    <div className="container space-y-6 py-6">
      <div>
        <Link href={`/projects/${projekt.id}`} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="me-1 h-4 w-4 rtl:rotate-180" />{projekt.name}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: projekt.color }} />
          {t["leads.title"]}
        </h1>
        <p className="text-sm text-muted-foreground">{t["leads.subtitle"]}</p>
      </div>

      <Card>
        <CardContent className="p-5">
          {editLead ? (
            <>
              <h2 className="mb-3 font-semibold">{t["leads.edit"]}</h2>
              <LeadForm
                key={editLead.id}
                projectId={projekt.id}
                cancelHref={listHref}
                lead={{
                  id: editLead.id,
                  company: editLead.company,
                  contact: editLead.contact ?? "",
                  channel: editLead.channel ?? "",
                  referredBy: editLead.referredBy ?? "",
                  commissionPct: editLead.commissionPct != null ? String(editLead.commissionPct) : "",
                  status: editLead.status,
                  nextAction: editLead.nextAction ?? "",
                  nextActionAt: editLead.nextActionAt ? editLead.nextActionAt.toISOString().slice(0, 10) : "",
                  notes: editLead.notes ?? "",
                }}
              />
            </>
          ) : (
            <details open={rows.length === 0 && !filter.status}>
              <summary className="cursor-pointer font-semibold">
                <Plus className="me-1 inline h-4 w-4" />
                {t["leads.new"]}
              </summary>
              <div className="mt-4">
                <LeadForm key="new" projectId={projekt.id} cancelHref={listHref} />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2" data-testid="lead-filter">
        <Link href={href({ status: null })} className={cn(chip, !filter.status ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
          {t["leads.filter.all"]}
        </Link>
        {LEAD_STATUSES.map((s) => (
          <Link key={s} href={href({ status: s })} className={cn(chip, filter.status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {t[`leads.status.${s}` as TKey]}
          </Link>
        ))}
        <Link href={href({ archived: !filter.showArchived })} className={cn(chip, "ms-auto", filter.showArchived ? "border-primary bg-primary/10" : "hover:bg-muted")}>
          <input type="checkbox" readOnly checked={filter.showArchived} className="me-1.5 h-3 w-3 align-middle accent-indigo-600" tabIndex={-1} aria-hidden />
          {t["leads.showArchived"]}
        </Link>
      </div>

      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t["leads.empty"]}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm" data-testid="leads-table">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t["leads.company"]}</th>
                <th className="px-3 py-2 text-start font-medium">{t["leads.contact"]}</th>
                <th className="px-3 py-2 text-start font-medium">{t["leads.channel"]}</th>
                <th className="px-3 py-2 text-start font-medium">{t["leads.referredBy"]}</th>
                <th className="px-3 py-2 text-start font-medium">{t["leads.status"]}</th>
                <th className="px-3 py-2 text-start font-medium">{t["leads.nextAction"]}</th>
                <th className="px-3 py-2 text-start font-medium">{t["leads.tasks"]}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {leads.map((lead) => {
                const linked = tasksByLead.get(lead.id) ?? [];
                const status = isLeadStatus(lead.status) ? lead.status : "New";
                const overdue = lead.nextActionAt && lead.nextActionAt < today && !lead.archivedAt;
                return (
                  <tr key={lead.id} id={`lead-${lead.id}`} className={cn("align-top", lead.archivedAt && "opacity-60")}>
                    <td className="px-3 py-2">
                      <span className="font-medium" dir="auto">{lead.company}</span>
                      {lead.archivedAt && <span className="ms-2 text-xs text-muted-foreground">({t["leads.archived"]})</span>}
                      {lead.notes && <p className="mt-0.5 line-clamp-2 max-w-xs whitespace-pre-line text-xs text-muted-foreground" dir="auto">{lead.notes}</p>}
                    </td>
                    <td className="px-3 py-2" dir="auto">{lead.contact ?? "—"}</td>
                    <td className="px-3 py-2" dir="auto">{lead.channel ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span dir="auto">{lead.referredBy ?? "—"}</span>
                      {lead.commissionPct != null && (
                        <span className="ms-1 text-xs text-muted-foreground" dir="ltr">· {lead.commissionPct} %</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", LEAD_STATUS_CHIP[status])}>
                        {t[`leads.status.${status}` as TKey]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span dir="auto">{lead.nextAction ?? "—"}</span>
                      {lead.nextActionAt && (
                        <span className={cn("block text-xs", overdue ? "font-semibold text-destructive" : "text-muted-foreground")}>
                          {format(lead.nextActionAt, "dd.MM.yyyy")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold">{linked.length}</span>
                      {linked.length > 0 && (
                        <ul className="mt-1 space-y-1">
                          {linked.map((task) => (
                            <li key={task.id} className="flex items-center gap-1.5">
                              <StatusBadge status={task.status} />
                              <Link href={`/tasks/${task.id}`} className="line-clamp-1 text-xs hover:underline" dir="auto">
                                {task.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {!lead.archivedAt && (
                          <Button asChild variant="ghost" size="sm" title={t["leads.newTask"]}>
                            <Link href={`/tasks/new?project=${projekt.id}&lead=${lead.id}`}>
                              <Plus className="me-1 h-4 w-4" />
                              {t["leads.newTask"]}
                            </Link>
                          </Button>
                        )}
                        <Button asChild variant="ghost" size="icon" title={t["leads.edit"]}>
                          <Link href={`${listHref}${listHref.includes("?") ? "&" : "?"}edit=${lead.id}`} aria-label={t["leads.edit"]}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <form action={setLeadArchivedAction}>
                          <input type="hidden" name="projectId" value={projekt.id} />
                          <input type="hidden" name="leadId" value={lead.id} />
                          <input type="hidden" name="archived" value={lead.archivedAt ? "0" : "1"} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            title={lead.archivedAt ? t["leads.restore"] : t["leads.archive"]}
                            aria-label={lead.archivedAt ? t["leads.restore"] : t["leads.archive"]}
                          >
                            {lead.archivedAt ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
