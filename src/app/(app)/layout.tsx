import { redirect } from "next/navigation";
import { getActiveTenant, listTenants } from "@/lib/tenant";
import { getActiveLocale } from "@/lib/locale";
import { isSuperAdmin } from "@/lib/enums";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/toast";
import { AppShell } from "@/components/app-shell";
import { WelcomeTour } from "@/components/welcome-tour";
import { UpdatePrompt } from "@/components/update-prompt";
import { resolveBranding, brandStyle } from "@/lib/branding";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getActiveTenant();
  if (!ctx) redirect("/login");
  const { user, tenant } = ctx;

  const locale = getActiveLocale();
  const tenants = isSuperAdmin(user.role) ? await listTenants() : [];
  const branding = resolveBranding(tenant);

  return (
    <I18nProvider locale={locale}>
      {/* Per-tenant white-label: override the Ocean-Pro brand vars */}
      <style dangerouslySetInnerHTML={{ __html: brandStyle(branding) }} />
      <ToastProvider>
        <AppShell
          user={user}
          locale={locale}
          tenant={tenant}
          tenants={tenants}
        >
          {children}
        </AppShell>
        <WelcomeTour run={!user.hasSeenTour} role={user.role} />
        <UpdatePrompt />
      </ToastProvider>
    </I18nProvider>
  );
}
