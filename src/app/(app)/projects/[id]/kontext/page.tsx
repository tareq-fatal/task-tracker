import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { canAccessProject } from "@/lib/task-access";
import { KONTEXT_VORLAGE } from "@/lib/kontext";
import { KontextEditor } from "@/components/kontext-editor";
import { Card, CardContent } from "@/components/ui/card";

// „Kontext für Claude“ je Projekt (Tarek 15.10.2026). Lesen: wer das Projekt öffnen darf.
// Ändern: Admins. Jede Speicherung ist eine Fassung (wer/wann); ?v=<id> zeigt eine ältere.
export const dynamic = "force-dynamic";

export default async function KontextPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string } }) {
  const { user, tenant } = await requireTenant();
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const projekt = await prisma.project.findFirst({ where: { id: params.id, tenantId: tenant.id, deletedAt: null }, select: { id: true, name: true, color: true } });
  if (!projekt || !(await canAccessProject(user, tenant.id, projekt.id))) notFound();

  const fassungen = await prisma.projectContext.findMany({
    where: { projectId: projekt.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, content: true, createdAt: true, user: { select: { name: true } } },
  });
  const aktuell = fassungen[0];
  const alt = searchParams.v ? fassungen.find((f) => f.id === searchParams.v && f !== aktuell) : undefined;
  const datum = (d: Date) => d.toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const darfAendern = isAdminRole(user.role);

  return (
    <div className="container space-y-6 py-6">
      <div>
        <Link href={`/projects/${projekt.id}`} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="me-1 h-4 w-4" />{projekt.name}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: projekt.color }} />
          {t["kontext.title"]}
        </h1>
        <p className="text-sm text-muted-foreground">{t["kontext.hint"].replace("{id}", projekt.id)}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_16rem]">
        <Card>
          <CardContent className="p-5">
            {alt ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">{t["kontext.old"].replace("{date}", datum(alt.createdAt)).replace("{name}", alt.user.name)}</p>
                <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 font-mono text-sm" dir="auto">{alt.content}</pre>
                <Link href={`/projects/${projekt.id}/kontext`} className="text-sm font-medium hover:underline">{t["kontext.backToCurrent"]}</Link>
              </div>
            ) : darfAendern ? (
              <KontextEditor projectId={projekt.id} inhalt={aktuell?.content ?? KONTEXT_VORLAGE} />
            ) : aktuell ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t["kontext.readOnly"]}</p>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm" dir="auto">{aktuell.content}</pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t["kontext.empty"]}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 font-semibold">{t["kontext.versions"]}</h2>
            {fassungen.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t["kontext.empty"]}</p>
            ) : (
              <ol className="space-y-2 text-sm" data-testid="kontext-fassungen">
                {fassungen.map((f, i) => (
                  <li key={f.id}>
                    <Link href={i === 0 ? `/projects/${projekt.id}/kontext` : `/projects/${projekt.id}/kontext?v=${f.id}`} className={`hover:underline ${f.id === (alt?.id ?? aktuell?.id) ? "font-semibold" : ""}`}>
                      {datum(f.createdAt)}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{f.user.name}{i === 0 ? ` · ${t["kontext.current"]}` : ""}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
