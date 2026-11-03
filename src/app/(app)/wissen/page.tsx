import Link from "next/link";
import { Download, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { wissenProjekte, wissenSuchen } from "@/lib/wissen/dienst";
import { WissenTreffer } from "@/components/wissen-treffer";
import { Button } from "@/components/ui/button";

// TOF-0839: Wissen über alle sichtbaren Projekte des Mandanten — Liste + Suche (/wissen?q=…).
export const dynamic = "force-dynamic";

export default async function WissenUebersicht({ searchParams }: { searchParams: { q?: string } }) {
  const { user, tenant } = await requireTenant();
  const t = getDictionary(getActiveLocale());
  const q = (searchParams.q ?? "").trim();
  const projekte = await wissenProjekte(user, tenant.id);
  const [zaehler, treffer] = await Promise.all([
    prisma.wissenSeite.groupBy({
      by: ["projectId"],
      where: { tenantId: tenant.id, deletedAt: null, projectId: { in: projekte.map((p) => p.id) } },
      _count: { _all: true },
    }),
    q ? wissenSuchen(user, tenant.id, q) : Promise.resolve(null),
  ]);
  const anzahl = new Map(zaehler.map((z) => [z.projectId, z._count._all]));

  return (
    <div className="container space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t["wissen.all"]}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{t["wissen.hint"]}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/api/wissen/export"><Download className="me-1 h-4 w-4" />{t["wissen.exportAll"]}</a>
        </Button>
      </div>
      <form className="flex max-w-xl gap-2" role="search">
        <input name="q" defaultValue={q} placeholder={t["wissen.searchAll"]} className="w-full rounded-md border bg-background px-3 py-2 text-sm" dir="auto" />
        <Button type="submit" variant="outline"><Search className="me-1 h-4 w-4" />{t["wissen.search"]}</Button>
      </form>
      {treffer && <WissenTreffer treffer={treffer} q={q} t={t} mitProjekt />}
      <section>
        <h2 className="mb-2 font-semibold">{t["wissen.projects"]}</h2>
        <ul className="divide-y rounded-lg border bg-card" data-testid="wissen-projekte">
          {projekte.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <Link href={`/projects/${p.id}/wissen`} className="flex items-center gap-2 font-medium hover:underline" dir="auto">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                {p.name}
              </Link>
              <span className="text-xs text-muted-foreground">{t["wissen.pages"].replace("{n}", String(anzahl.get(p.id) ?? 0))}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
