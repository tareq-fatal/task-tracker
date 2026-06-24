import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveLocale } from "@/lib/locale";
import { I18nProvider } from "@/components/i18n-provider";
import { ToastProvider } from "@/components/toast";
import { AppShell } from "@/components/app-shell";
import { WelcomeTour } from "@/components/welcome-tour";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const locale = getActiveLocale();

  return (
    <I18nProvider locale={locale}>
      <ToastProvider>
        <AppShell user={user} locale={locale}>
          {children}
        </AppShell>
        <WelcomeTour run={!user.hasSeenTour} role={user.role} />
      </ToastProvider>
    </I18nProvider>
  );
}
