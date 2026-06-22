import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { I18nProvider } from "@/components/i18n-provider";
import { AppShell } from "@/components/app-shell";
import type { Locale } from "@/lib/enums";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const locale = (user.locale as Locale) ?? "de";

  return (
    <I18nProvider locale={locale}>
      <AppShell user={user}>{children}</AppShell>
    </I18nProvider>
  );
}
