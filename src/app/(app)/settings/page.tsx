import { requireUser } from "@/lib/auth";
import { getDictionary } from "@/lib/i18n";
import { getActiveLocale } from "@/lib/locale";
import { isAdminRole } from "@/lib/enums";
import { SettingsForm } from "@/components/settings-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { TooltipToggle } from "@/components/tooltip-toggle";
import { PushToggle } from "@/components/push-toggle";
import { RestartTourButton } from "@/components/restart-tour-button";
import { SsoSettings } from "@/components/sso-settings";
import { getTenantSsoConfig } from "@/actions/sso";
import { PlannerSyncSettings } from "@/components/planner-sync-settings";
import { getPlannerSyncView } from "@/actions/planner-sync";
import { NotificationSettings } from "@/components/notification-settings";
import { getNotificationPrefs } from "@/actions/notifications";
import { TelegramConnect } from "@/components/telegram-connect";
import { getTelegramStatus, getNotifyAllEvents } from "@/actions/telegram";
import { NotifyAllToggle } from "@/components/notify-all-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Locale } from "@/lib/enums";

export default async function SettingsPage() {
  const user = await requireUser();
  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const isAdmin = isAdminRole(user.role);
  const ssoConfig = isAdmin ? await getTenantSsoConfig() : null;
  const plannerView = isAdmin ? await getPlannerSyncView() : null;
  const notifyPrefs = await getNotificationPrefs();
  const telegramStatus = await getTelegramStatus();
  const notifyAll = isAdminRole(user.role) ? await getNotifyAllEvents() : false;

  return (
    <div className="container max-w-xl py-6">
      <h1 className="mb-6 text-2xl font-bold">{t["settings.title"]}</h1>

      {/* Theme — the one setting everyone gets */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t["settings.theme"]}</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      {/* Help tooltips — everyone gets this too */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t["settings.tooltips"]}</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipToggle />
        </CardContent>
      </Card>

      {/* Profile / password. Regular users get the minimal form (password only);
          admins keep language + everything below. */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">
            {user.name} · @{user.username}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SettingsForm locale={locale} minimal={!isAdmin} />
        </CardContent>
      </Card>

      {/* Push toggle — EVERYONE gets this. Regular users must be able to enable
          device notifications (assigned tasks, comments, mentions) themselves;
          only the fine-grained prefs matrix below stays admin-only. */}
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

      {/* Telegram — deep-link connect; notifications mirror the push triggers */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t["settings.telegram"]}</CardTitle>
        </CardHeader>
        <CardContent>
          <TelegramConnect status={telegramStatus} />
          {isAdmin && <NotifyAllToggle initial={notifyAll} />}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">{t["notif.prefsTitle"]}</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationSettings view={notifyPrefs} />
          </CardContent>
        </Card>
      )}

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

      {plannerView && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              {t["settings.planner.title"]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PlannerSyncSettings view={plannerView} />
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">{t["settings.mobile.title"]}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                {t["settings.mobile.desc"]}
              </p>
              <a
                href="/download/task-tracker-latest.apk"
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-pink-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
              >
                📱 {t["settings.mobile.download"]}
              </a>
              <p className="mt-3 text-xs text-muted-foreground">
                {t["settings.mobile.steps"]}
              </p>
              <p className="mt-1 text-xs italic text-amber-600">
                {t["settings.mobile.beta"]}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t["tour.restart"]}</CardTitle>
            </CardHeader>
            <CardContent>
              <RestartTourButton />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
