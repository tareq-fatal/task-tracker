import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { dirForLocale, isLocale, type Locale } from "@/lib/enums";
import { INVITE_MIN_PASSWORD, hashInviteToken, inviteUsable, isPlausibleInviteToken } from "@/lib/invite";
import { I18nProvider } from "@/components/i18n-provider";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InviteForm } from "./invite-form";

// Einladungslink zum Passwort-Setzen (TOF-0783, Tarek 28.10.2026).
// Öffentlich (kein Login, nicht im Middleware-Matcher, außerhalb von (app)).
// GET hat keine Nebenwirkung — Link-Vorschauen (Telegram/WhatsApp) verbrauchen
// die Einladung nicht. Erscheint in der Sprache des eingeladenen Benutzers.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Token steckt im Pfad — nie als Referer weitergeben.
  referrer: "no-referrer",
};

export default async function InvitePage({ params }: { params: { token: string } }) {
  const raw = params.token;
  // Allowlisted in tenant-isolation.test.ts: lookup by the unique hash; tenant
  // + user binding is then verified by inviteUsable().
  const invite = isPlausibleInviteToken(raw)
    ? await prisma.invite.findUnique({
        where: { tokenHash: hashInviteToken(raw) },
        include: {
          user: { select: { id: true, name: true, username: true, tenantId: true, deactivatedAt: true, locale: true } },
          tenant: { select: { name: true, logo: true } },
        },
      })
    : null;
  const valid = Boolean(invite && inviteUsable(invite, invite.user));

  const locale: Locale = valid && isLocale(invite!.user.locale) ? invite!.user.locale : getActiveLocale();
  const t = getDictionary(locale);
  const dir = dirForLocale(locale);

  return (
    <I18nProvider locale={locale}>
      <main
        lang={locale}
        dir={dir}
        className={`relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-pink-50 p-4 ${locale === "ar" ? "font-cairo" : "font-sans"}`}
      >
        <div className="pointer-events-none absolute -top-24 -start-24 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-pink-300/30 blur-3xl" />
        <Card className="glass w-full max-w-sm overflow-hidden border-white/50 shadow-2xl shadow-indigo-900/10">
          <div className="h-1.5 w-full brand-gradient" />
          <CardHeader className="items-center pt-8 text-center">
            {valid && invite!.tenant.logo ? (
              <div className="mb-3 flex h-20 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={invite!.tenant.logo} alt={invite!.tenant.name} className="max-h-16 max-w-[220px] object-contain" />
              </div>
            ) : (
              <div className="relative mb-3 grid h-20 w-20 place-items-center">
                <Logo size={64} />
              </div>
            )}
            <CardTitle className="text-2xl">
              {valid ? t["invite.title"] : t["invite.invalid.title"]}
            </CardTitle>
            {valid && (
              <CardDescription>
                {t["invite.welcome"].replace("{name}", invite!.user.name)}
                {" · "}
                <bdi dir="ltr">@{invite!.user.username}</bdi>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {valid ? (
              <>
                <p className="mb-4 text-sm text-muted-foreground">{t["invite.intro"]}</p>
                <InviteForm token={raw} minLength={INVITE_MIN_PASSWORD} />
              </>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">{t["invite.invalid.text"]}</p>
                <Button asChild variant="outline">
                  <Link href="/login">{t["invite.toLogin"]}</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </I18nProvider>
  );
}
