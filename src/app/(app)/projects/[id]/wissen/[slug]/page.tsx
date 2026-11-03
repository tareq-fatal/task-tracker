import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Pin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { aufgabenZuTof, seiteLesen, versionLesen, wissenRechte } from "@/lib/wissen/dienst";
import { seitenVerweise, tofVerweise, zeilenDiff } from "@/lib/wissen/text";
import { loescheWissenSeiteAction, wiederherstellenAction } from "@/actions/wissen";
import { WissenMarkdown } from "@/components/wissen-markdown";
import { WissenEditor } from "@/components/wissen-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// TOF-0839: eine Wissen-Seite — Ansicht, Bearbeiten (?bearbeiten=1), Version mit Diff (?v=<id>).
export const dynamic = "force-dynamic";

const STATUS_FARBE: Record<string, string> = {
  Todo: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  InProgress: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  Done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  Archived: "bg-muted text-muted-foreground",
};

export default async function WissenSeitePage({
  params,
  searchParams,
}: {
  params: { id: string; slug: string };
  searchParams: { v?: string; bearbeiten?: string };
}) {
  const { user, tenant } = await requireTenant();
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const rechte = await wissenRechte(user, tenant.id, params.id);
  if (!rechte.lesen || !rechte.projekt) notFound();
  const seite = await seiteLesen(user, tenant.id, params.id, params.slug, { versionen: 50 });
  if (!seite) notFound();
  const projektId = rechte.projekt.id;
  const basis = `/projects/${projektId}/wissen`;
  const datum = (d: Date) => d.toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const version = searchParams.v ? await versionLesen(user, tenant.id, projektId, seite.slug, searchParams.v) : null;
  const bearbeiten = rechte.schreiben && searchParams.bearbeiten === "1" && !version;

  const tofs = tofVerweise(seite.inhalt);
  const [aufgaben, zielSeiten] = await Promise.all([
    aufgabenZuTof(user, tenant.id, tofs),
    prisma.wissenSeite.findMany({
      where: { tenantId: tenant.id, projectId: projektId, deletedAt: null, slug: { in: seitenVerweise(seite.inhalt) } },
      select: { slug: true, titel: true },
    }),
  ]);
  const tofLinks = Object.fromEntries(aufgaben.filter((a) => a.tof).map((a) => [a.tof!, a.id]));
  const verweise = seitenVerweise(seite.inhalt).filter((s) => s !== seite.slug);
  const versionen = seite.versionen ?? [];

  return (
    <div className="container space-y-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={basis} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:underline">
            <ArrowLeft className="me-1 h-4 w-4" />{rechte.projekt.name} · {t["wissen.title"]}
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold" dir="auto">
            {seite.angepinnt && <Pin className="h-5 w-5 text-amber-600" aria-label={t["wissen.pinned"]} />}
            {seite.titel}
          </h1>
          <p className="text-xs text-muted-foreground">
            <code className="font-mono">{seite.slug}</code> · {t[`wissen.art.${seite.art as "stand"}`] ?? seite.art} ·{" "}
            {t["wissen.updated"].replace("{date}", datum(seite.aktualisiertAm)).replace("{name}", seite.von ?? "?")}
          </p>
        </div>
        {rechte.schreiben && !bearbeiten && !version && (
          <Button asChild variant="outline" size="sm">
            <Link href={`${basis}/${seite.slug}?bearbeiten=1`}><Pencil className="me-1 h-4 w-4" />{t["wissen.edit"]}</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardContent className="p-5">
            {version ? (
              <div className="space-y-3" data-testid="wissen-diff">
                <p className="text-sm font-medium">{t["wissen.versionOf"].replace("{date}", datum(version.createdAt)).replace("{name}", version.vonName)}</p>
                <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed" dir="auto">
                  {zeilenDiff(seite.inhalt, version.inhalt).map((z, i) => (
                    <div
                      key={i}
                      className={z.typ === "neu" ? "bg-emerald-100 dark:bg-emerald-500/20" : z.typ === "weg" ? "bg-red-100 line-through dark:bg-red-500/20" : ""}
                    >
                      {z.typ === "neu" ? "+ " : z.typ === "weg" ? "- " : "  "}
                      {z.text || " "}
                    </div>
                  ))}
                </pre>
                <p className="text-xs text-muted-foreground">− aktuell · + diese Version</p>
                <div className="flex flex-wrap items-center gap-3">
                  {rechte.schreiben && (
                    <form action={wiederherstellenAction}>
                      <input type="hidden" name="projectId" value={projektId} />
                      <input type="hidden" name="slug" value={seite.slug} />
                      <input type="hidden" name="versionId" value={version.id} />
                      <Button type="submit" size="sm">{t["wissen.restore"]}</Button>
                    </form>
                  )}
                  <Link href={`${basis}/${seite.slug}`} className="text-sm font-medium hover:underline">{t["wissen.backToCurrent"]}</Link>
                </div>
                {rechte.schreiben && <p className="text-xs text-muted-foreground">{t["wissen.restoreHint"]}</p>}
              </div>
            ) : bearbeiten ? (
              <div className="space-y-3">
                <WissenEditor projectId={projektId} seite={{ slug: seite.slug, titel: seite.titel, art: seite.art, angepinnt: seite.angepinnt, inhalt: seite.inhalt }} />
                <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                  <Link href={`${basis}/${seite.slug}`} className="text-sm hover:underline">{t["wissen.cancel"]}</Link>
                  <form action={loescheWissenSeiteAction}>
                    <input type="hidden" name="projectId" value={projektId} />
                    <input type="hidden" name="slug" value={seite.slug} />
                    <Button type="submit" variant="outline" size="sm" className="text-red-700">{t["wissen.delete"]}</Button>
                  </form>
                </div>
              </div>
            ) : (
              <WissenMarkdown text={seite.inhalt} projectId={projektId} tofLinks={tofLinks} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {aufgaben.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 font-semibold">{t["wissen.linkedTasks"]}</h2>
                <ul className="space-y-2 text-sm" data-testid="wissen-aufgaben">
                  {aufgaben.map((a) => (
                    <li key={a.id}>
                      <Link href={`/tasks/${a.id}`} className="hover:underline" dir="auto">{a.title}</Link>
                      <span className={`ms-1 rounded px-1.5 py-0.5 text-[10px] ${STATUS_FARBE[a.status] ?? ""}`}>{t[`status.${a.status as "Done"}`] ?? a.status}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {verweise.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 font-semibold">{t["wissen.linkedPages"]}</h2>
                <ul className="space-y-1 text-sm">
                  {verweise.map((s) => {
                    const z = zielSeiten.find((x) => x.slug === s);
                    return (
                      <li key={s}>
                        <Link href={`${basis}/${s}`} className="hover:underline">{z?.titel ?? s}</Link>
                        {!z && <span className="ms-1 text-xs text-muted-foreground">{t["wissen.missingPage"]}</span>}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-3 font-semibold">{t["wissen.history"]}</h2>
              <ol className="space-y-2 text-sm" data-testid="wissen-versionen">
                {versionen.map((v, i) => (
                  <li key={v.id}>
                    <Link
                      href={i === 0 ? `${basis}/${seite.slug}` : `${basis}/${seite.slug}?v=${v.id}`}
                      className={`hover:underline ${v.id === (version?.id ?? versionen[0]?.id) ? "font-semibold" : ""}`}
                    >
                      {datum(v.createdAt)}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{v.vonName}{i === 0 ? ` · ${t["wissen.current"]}` : ""}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
