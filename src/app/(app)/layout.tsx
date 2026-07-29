import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { getActiveTenant, listTenants } from "@/lib/tenant";
import { getActiveLocale } from "@/lib/locale";
import { isSuperAdmin } from "@/lib/enums";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/toast";
import { NoticeToast } from "@/components/notice-toast";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { UpdatePrompt } from "@/components/update-prompt";
import { PushBootstrap } from "@/components/push-bootstrap";
import { SentryUserContext } from "@/components/sentry-user-context";
import { resolveBranding, brandStyle } from "@/lib/branding";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getActiveTenant();
  if (!ctx) redirect("/login");
  const { user, tenant } = ctx;

  Sentry.setUser({ id: user.id, username: user.username });
  Sentry.setTag("tenantId", user.tenantId);
  Sentry.setTag("tenantSlug", user.tenantSlug);
  Sentry.setTag("role", user.role);

  const locale = getActiveLocale();
  const tenants = isSuperAdmin(user.role) ? await listTenants() : [];
  const branding = resolveBranding(tenant);

  return (
    <I18nProvider locale={locale}>
      {/* Per-tenant white-label: override the Ocean-Pro brand vars */}
      <style dangerouslySetInnerHTML={{ __html: brandStyle(branding) }} />
      <ToastProvider>
        <Suspense fallback={null}>
          <NoticeToast />
        </Suspense>
        <SentryUserContext user={user} />
        <AppShell
          user={user}
          locale={locale}
          tenant={tenant}
          tenants={tenants}
        >
          {children}
        </AppShell>
        <OnboardingFlow
          name={user.name}
          role={user.role}
          needsOnboarding={!user.onboardedAt}
          needsTour={!!user.onboardedAt && !user.hasSeenTour}
        />
        <UpdatePrompt />
        <PushBootstrap
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        />
      </ToastProvider>
    </I18nProvider>
  );
}
