import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { isAdminRole } from "@/lib/enums";
import { SettingsForm } from "@/components/settings-form";
import { PushToggle } from "@/components/push-toggle";
import { RestartTourButton } from "@/components/restart-tour-button";
import { SsoSettings } from "@/components/sso-settings";
import { getTenantSsoConfig } from "@/actions/sso";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/lib/enums";

export default async function SettingsPage() {
  const user = await requireUser();
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const ssoConfig = isAdminRole(user.role) ? await getTenantSsoConfig() : null;

  return (
    <div className="container max-w-xl py-6">
      <h1 className="mb-6 text-2xl font-bold">{t["settings.title"]}</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            {user.name} · @{user.username}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm locale={locale} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            {t["settings.notifications"]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PushToggle vapidPublicKey={vapid} />
        </CardContent>
      </Card>

      {ssoConfig && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">{t["settings.sso.title"]}</CardTitle>
          </CardHeader>
          <CardContent>
            <SsoSettings config={ssoConfig} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t["tour.restart"]}</CardTitle>
        </CardHeader>
        <CardContent>
          <RestartTourButton />
        </CardContent>
      </Card>
    </div>
  );
}
