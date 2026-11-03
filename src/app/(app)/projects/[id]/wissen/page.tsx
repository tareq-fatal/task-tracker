import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Pin, Search } from "lucide-react";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { entscheidungenListe, aufgabenZuTof, seitenListe, wissenRechte, wissenSuchen } from "@/lib/wissen/dienst";
import { WISSEN_ARTEN } from "@/lib/wissen/text";
import { WissenEditor, EntscheidungForm } from "@/components/wissen-editor";
import { WissenTreffer } from "@/components/wissen-treffer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// TOF-0839 Projekt-Wissen: Seiten nach Art, Suche, Entscheidungs-Log, Export.
// Lesen: Staff + Projektmitglieder/-Ersteller; Schreiben: Admins + Mitglieder (lib/wissen/dienst.ts).
export const dynamic = "force-dynamic";

export default async function WissenPage({ params, searchParams }: { params: { id: string }; searchParams: { q?: string; neu?: string } }) {
  const { user, tenant } = await requireTenant();
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const rechte = await wissenRechte(user, tenant.id, params.id);
  if (!rechte.lesen || !rechte.projekt) notFound();
  const projekt = rechte.projekt;
  const q = (searchParams.q ?? "").trim();

  const [seiten, entscheidungen, treffer] = await Promise.all([
    seitenListe(user, tenant.id, projekt.id),
    entscheidungenListe(user, tenant.id, projekt.id, 200),
    q ? wissenSuchen(user, tenant.id, q, { projectId: projekt.id }) : Promise.resolve(null),
  ]);
  const tofs = [...new Set(entscheidungen.flatMap((e) => e.aufgaben))];
  const aufgaben = await aufgabenZuTof(user, tenant.id, tofs);
  const tofLink = new Map(aufgaben.filter((a) => a.tof).map((a) => [a.tof!, a.id]));
  const datum = (d: Date) => d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div className="container space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/projects/${projekt.id}`} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="me-1 h-4 w-4" />{projekt.name}
          </Link>
          <h1 className="text-2xl font-bold">{t["wissen.title"]}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{t["wissen.hint"]}</p>
          <p className="text-xs text-muted-foreground">projectId: <code className="font-mono">{projekt.id}</code></p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/wissen/export?projectId=${projekt.id}`} data-testid="wissen-export"><Download className="me-1 h-4 w-4" />{t["wissen.export"]}</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/wissen">{t["wissen.all"]}</Link>
          </Button>
        </div>
      </div>

      <form className="flex max-w-xl gap-2" role="search">
        <input name="q" defaultValue={q} placeholder={t["wissen.searchPlaceholder"]} className="w-full rounded-md border bg-background px-3 py-2 text-sm" dir="auto" />
        <Button type="submit" variant="outline"><Search className="me-1 h-4 w-4" />{t["wissen.search"]}</Button>
      </form>
      {treffer && <WissenTreffer treffer={treffer} q={q} t={t} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {seiten.length === 0 && <p className="text-sm text-muted-foreground">{t["wissen.empty"]}</p>}
          {WISSEN_ARTEN.map((art) => {
            const liste = seiten.filter((s) => s.art === art);
            if (liste.length === 0) return null;
            return (
              <section key={art} data-testid={`wissen-gruppe-${art}`}>
                <h2 className="mb-2 font-semibold">{t[`wissen.art.${art}`]}</h2>
                <ul className="divide-y rounded-lg border bg-card">
                  {liste.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                      <Link href={`/projects/${projekt.id}/wissen/${s.slug}`} className="font-medium hover:underline" dir="auto">
                        {s.angepinnt && <Pin className="me-1 inline h-3.5 w-3.5 text-amber-600" aria-label={t["wissen.pinned"]} />}
                        {s.titel}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        <code className="font-mono">{s.slug}</code> · {datum(s.aktualisiertAm)}{s.von ? ` · ${s.von}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          <section data-testid="wissen-entscheidungen">
            <h2 className="mb-2 font-semibold">{t["wissen.decisions"]}</h2>
            {entscheidungen.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t["wissen.decision.empty"]}</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-start">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t["wissen.decision.date"]}</th>
                      <th className="px-3 py-2 text-start font-medium">{t["wissen.decision.who"]}</th>
                      <th className="px-3 py-2 text-start font-medium">{t["wissen.decision.what"]}</th>
                      <th className="px-3 py-2 text-start font-medium">{t["wissen.decision.why"]}</th>
                      <th className="px-3 py-2 text-start font-medium">{t["wissen.decision.tasks"]}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entscheidungen.map((e) => (
                      <tr key={e.id} id={`e-${e.id}`} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2">{datum(e.datum)}</td>
                        <td className="px-3 py-2" dir="auto">{e.wer}</td>
                        <td className="px-3 py-2" dir="auto">
                          <span className="whitespace-pre-wrap">{e.was}</span>
                          {e.korrigiertId && (
                            <a href={`#e-${e.korrigiertId}`} className="ms-1 text-xs text-muted-foreground hover:underline">({t["wissen.decision.corrects"]} {e.korrigiertId.slice(-6)})</a>
                          )}
                          <span className="block font-mono text-[10px] text-muted-foreground">{e.id}</span>
                        </td>
                        <td className="whitespace-pre-wrap px-3 py-2" dir="auto">{e.warum}</td>
                        <td className="px-3 py-2">
                          {e.aufgaben.map((a) => {
                            const id = tofLink.get(a);
                            return id ? <Link key={a} href={`/tasks/${id}`} className="me-1 block font-mono text-xs text-primary hover:underline">{a}</Link> : <span key={a} className="me-1 block font-mono text-xs">{a}</span>;
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {rechte.schreiben ? (
            <>
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-3 font-semibold">{t["wissen.newPage"]}</h2>
                  <WissenEditor projectId={projekt.id} />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-3 font-semibold">{t["wissen.decision.add"]}</h2>
                  <EntscheidungForm projectId={projekt.id} />
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t["wissen.readOnly"]}</p>
          )}
        </div>
      </div>
    </div>
  );
}
