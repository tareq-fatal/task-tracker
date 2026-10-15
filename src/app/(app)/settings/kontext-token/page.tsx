import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { isAdminRole } from "@/lib/enums";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { widerrufeKontextTokenAction } from "@/actions/kontext";
import { KontextTokenForm } from "@/components/kontext-token-form";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Agenten-Tokens (Tarek 15.10.2026): nur Admins, nur die engen Scopes „kontext“ und „kommentar“.
// MCP-Tokens (read/write) bleiben beim Skript scripts/mcp-token.mjs und erscheinen hier nicht.
export const dynamic = "force-dynamic";

export default async function KontextTokenPage() {
  const { user, tenant } = await requireTenant();
  if (!isAdminRole(user.role)) redirect("/");
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const tokens = await prisma.apiToken.findMany({
    where: { tenantId: tenant.id, scopes: { in: ["kontext", "kommentar"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, user: { select: { name: true } } },
  });
  const datum = (d: Date | null) => (d ? d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" }) : t["kontext.tokenNever"]);

  return (
    <div className="container max-w-4xl space-y-6 py-6">
      <div>
        <h1 className="text-2xl font-bold">{t["kontext.tokens"]}</h1>
        <p className="text-sm text-muted-foreground">{t["kontext.tokensHint"]}</p>
      </div>
      <Card><CardContent className="p-5"><KontextTokenForm /></CardContent></Card>
      <Card>
        <CardContent className="p-5">
          <h2 className="mb-3 font-semibold">{t["kontext.tokenList"]}</h2>
          <ul className="divide-y text-sm" data-testid="token-liste">
            {tokens.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <span className="font-medium">{k.name}</span>{" "}
                  <code className="text-xs text-muted-foreground">{k.prefix}…</code>
                  <span className="block text-xs text-muted-foreground">
                    {k.scopes === "kontext" ? t["kontext.artKontext"] : t["kontext.artKommentar"]} · {k.user.name} · {datum(k.createdAt)}
                    {" · "}{t["kontext.tokenLastUsed"]} {datum(k.lastUsedAt)}
                    {k.expiresAt ? ` · → ${datum(k.expiresAt)}` : ""}
                  </span>
                </div>
                {k.revokedAt ? (
                  <span className="text-xs text-muted-foreground">{t["kontext.tokenRevoked"]} {datum(k.revokedAt)}</span>
                ) : (
                  <form action={widerrufeKontextTokenAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <Button type="submit" variant="outline" size="sm">{t["kontext.tokenRevoke"]}</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
