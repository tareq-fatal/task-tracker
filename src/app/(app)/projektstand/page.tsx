import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { taskVisibilityClause, visibleProjectIds } from "@/lib/task-access";
import { PRIORITY_SHORT, type TaskPriority } from "@/lib/enums";
import { berechneProjektstand, ZEITRAEUME, OHNE_PROJEKT, type StandAufgabe } from "@/lib/projektstand";
import { Card, CardContent } from "@/components/ui/card";
import { LineChart } from "@/components/line-chart";
import { AutoRefresh } from "@/components/auto-refresh";

// Projektstand (Tarek 14.10.2026): wo stehen wir — live aus der DB, für jedes Projekt ohne
// Konfiguration. Sichtbar ist nur, was der Benutzer auch sonst sehen darf (taskVisibilityClause).
export const dynamic = "force-dynamic";

const FARBE = { erledigt: "bg-emerald-500", inArbeit: "bg-amber-400", offen: "bg-indigo-300" } as const;
const PRIO_FARBE: Record<TaskPriority, string> = { Critical: "bg-red-500", High: "bg-orange-400", Medium: "bg-amber-300", Low: "bg-slate-300" };

function Balken({ erledigt, inArbeit, offen, titel }: { erledigt: number; inArbeit: number; offen: number; titel: string }) {
  const g = erledigt + inArbeit + offen;
  const teil = (n: number) => (g ? `${(100 * n) / g}%` : "0%");
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label={titel} title={titel}>
      <div className={FARBE.erledigt} style={{ width: teil(erledigt) }} />
      <div className={FARBE.inArbeit} style={{ width: teil(inArbeit) }} />
      <div className={FARBE.offen} style={{ width: teil(offen) }} />
    </div>
  );
}

export default async function ProjektstandPage({ searchParams }: { searchParams: { projekt?: string; wochen?: string } }) {
  const { user, tenant } = await requireTenant();
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const wochen = (ZEITRAEUME as readonly number[]).includes(Number(searchParams.wochen)) ? Number(searchParams.wochen) : 12;

  const allowed = await visibleProjectIds(user, tenant.id);
  const projekte = await prisma.project.findMany({
    where: { tenantId: tenant.id, deletedAt: null, ...(allowed ? { id: { in: allowed } } : {}) },
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });
  const gewaehlt = projekte.some((p) => p.id === searchParams.projekt) || searchParams.projekt === OHNE_PROJEKT ? searchParams.projekt! : "";

  const zeilen = await prisma.task.findMany({
    where: {
      AND: [
        taskVisibilityClause(user, tenant.id),
        { deletedAt: null },
        gewaehlt === OHNE_PROJEKT ? { projectId: null } : gewaehlt ? { projectId: gewaehlt } : {},
        // Aufgaben gelöschter Projekte gehören nicht mehr zum Stand.
        { OR: [{ projectId: null }, { project: { deletedAt: null } }] },
      ],
    },
    select: { id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true, updatedAt: true, projectId: true },
  });
  const aufgaben: StandAufgabe[] = zeilen;
  const sichtbareProjekte = gewaehlt && gewaehlt !== OHNE_PROJEKT ? projekte.filter((p) => p.id === gewaehlt) : gewaehlt ? [] : projekte;
  const s = berechneProjektstand(aufgaben, sichtbareProjekte, new Date(), wochen);
  const name = (id: string, n: string) => (id === OHNE_PROJEKT ? t["ps.noProject"] : n);
  const projektName = new Map(projekte.map((p) => [p.id, p.name]));
  const datum = (d: Date | null) => (d ? d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
  const titelBalken = (e: number, a: number, o: number) => `${t["status.Done"]} ${e} · ${t["status.InProgress"]} ${a} · ${t["status.Todo"]} ${o}`;

  const Liste = ({ titel, aufgaben, mitDatum }: { titel: string; aufgaben: StandAufgabe[]; mitDatum: (a: StandAufgabe) => Date | null }) => (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-3 font-semibold">{titel}</h2>
        {aufgaben.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t["ps.none"]}</p>
        ) : (
          <ul className="divide-y">
            {aufgaben.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <Link href={`/tasks/${a.id}`} className="min-w-0 truncate font-medium hover:underline">{a.title}</Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {a.projectId ? projektName.get(a.projectId) ?? "" : t["ps.noProject"]} · {datum(mitDatum(a))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container space-y-6 py-6">
      <AutoRefresh seconds={60} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t["ps.title"]}</h1>
          <p className="text-sm text-muted-foreground">{t["ps.subtitle"]}</p>
        </div>
        <form method="get" className="flex flex-wrap items-center gap-2 text-sm" data-testid="ps-filter">
          <select name="projekt" defaultValue={gewaehlt} className="h-9 rounded-md border bg-background px-2" aria-label={t["nav.projects"]}>
            <option value="">{t["ps.allProjects"]}</option>
            {projekte.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={OHNE_PROJEKT}>{t["ps.noProject"]}</option>
          </select>
          <select name="wochen" defaultValue={String(wochen)} className="h-9 rounded-md border bg-background px-2" aria-label={t["ps.range"]}>
            {ZEITRAEUME.map((w) => <option key={w} value={w}>{t["ps.weeks"].replace("{n}", String(w))}</option>)}
          </select>
          <button type="submit" className="h-9 rounded-md bg-primary px-3 font-medium text-primary-foreground">{t["ps.show"]}</button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t["ps.progress"], `${s.gesamt.prozent} %`],
          [t["status.InProgress"], s.gesamt.inArbeit],
          [t["ps.overdue"], s.gesamt.ueberfaellig],
          [t["ps.doneInRange"], s.gesamt.erledigtImZeitraum],
        ].map(([k, v]) => (
          <Card key={String(k)}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="text-2xl font-bold" data-testid="ps-kpi">{v}</p></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 p-5">
          <Balken erledigt={s.gesamt.erledigt} inArbeit={s.gesamt.inArbeit} offen={s.gesamt.offen} titel={titelBalken(s.gesamt.erledigt, s.gesamt.inArbeit, s.gesamt.offen)} />
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><span className={`me-1 inline-block h-2 w-2 rounded-full ${FARBE.erledigt}`} />{t["status.Done"]} {s.gesamt.erledigt}</span>
            <span><span className={`me-1 inline-block h-2 w-2 rounded-full ${FARBE.inArbeit}`} />{t["status.InProgress"]} {s.gesamt.inArbeit}</span>
            <span><span className={`me-1 inline-block h-2 w-2 rounded-full ${FARBE.offen}`} />{t["status.Todo"]} {s.gesamt.offen}</span>
          </div>
          <h2 className="pt-2 font-semibold">{t["ps.perWeek"]}</h2>
          <LineChart data={s.wochen.map((w) => ({ label: w.label, count: w.count }))} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {s.projekte.map((z) => (
          <Card key={z.id} data-testid="ps-projekt">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: z.color }} />
                  {z.id === OHNE_PROJEKT ? (
                    <h3 className="truncate font-semibold">{name(z.id, z.name)}</h3>
                  ) : (
                    <Link href={`/projects/${z.id}`} className="truncate font-semibold hover:underline">{z.name}</Link>
                  )}
                </div>
                <span className="shrink-0 text-sm font-bold">{z.prozent} %</span>
              </div>
              <Balken erledigt={z.erledigt} inArbeit={z.inArbeit} offen={z.offen} titel={titelBalken(z.erledigt, z.inArbeit, z.offen)} />
              <p className="text-xs text-muted-foreground">
                {t["status.Done"]} {z.erledigt} · {t["status.InProgress"]} {z.inArbeit} · {t["status.Todo"]} {z.offen}
                {z.ueberfaellig > 0 && <span className="ms-2 font-semibold text-red-700">{t["ps.overdue"]} {z.ueberfaellig}</span>}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 text-xs" aria-label={t["ps.priorityOpen"]} title={t["ps.priorityOpen"]}>
                {(["Critical", "High", "Medium", "Low"] as TaskPriority[]).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5" title={t[`priority.${p}`]}>
                    <span className={`h-2 w-2 rounded-full ${PRIO_FARBE[p]}`} />{PRIORITY_SHORT[p]} {z.prio[p]}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t["ps.lastActivity"]}: {datum(z.letzteAktivitaet)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Liste titel={t["ps.inProgressNow"]} aufgaben={s.inArbeit} mitDatum={(a) => a.updatedAt} />
        <Liste titel={t["ps.recentlyDone"]} aufgaben={s.zuletztErledigt} mitDatum={(a) => a.completedAt} />
      </div>
    </div>
  );
}
