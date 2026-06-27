import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { I18nProvider } from "@/components/i18n-provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";
import { SsoButtons } from "@/components/sso-buttons";
import { configuredProviders } from "@/lib/sso";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { sso?: string };
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const locale = getActiveLocale();
  const t = getDictionary(locale);
  const providers = configuredProviders();
  const ssoError = Boolean(searchParams?.sso);

  return (
    <I18nProvider locale={locale}>
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-pink-50 p-4">
        {/* soft decorative glows */}
        <div className="pointer-events-none absolute -top-24 -start-24 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -end-24 h-72 w-72 rounded-full bg-pink-300/30 blur-3xl" />

        <div className="absolute end-4 top-4">
          <LocaleSwitcher current={locale} />
        </div>
        <Card className="glass w-full max-w-sm overflow-hidden border-white/50 shadow-2xl shadow-indigo-900/10">
          <div className="h-1.5 w-full brand-gradient" />
          <CardHeader className="items-center pt-8 text-center">
            <div className="relative mb-3 grid h-20 w-20 place-items-center">
              <span className="brand-gradient absolute inset-0 rounded-3xl opacity-25 blur-xl" />
              <span className="tt-pulse-ring absolute inset-1 rounded-3xl border-2 border-indigo-400/40" />
              <Logo size={64} animated />
            </div>
            <CardTitle className="text-2xl">
              <span className="brand-text">{t["app.name"]}</span>
            </CardTitle>
            <CardDescription>{t["login.subtitle"]}</CardDescription>
          </CardHeader>
          <CardContent>
            {ssoError && (
              <p className="mb-3 rounded-md bg-destructive/10 p-2 text-center text-sm font-medium text-destructive">
                {t["login.sso.error"]}
              </p>
            )}
            <LoginForm />
            <SsoButtons providers={providers} />
            <div className="mt-6 rounded-md bg-muted p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">
                {t["login.demo"]}
              </p>
              <p>
                admin / <code>Admin-2026!</code>
              </p>
              <p>
                alice · bob · charlie / <code>Demo-2026!</code>
              </p>
            </div>
            <div className="mt-4 text-center">
              <a
                href="/download/task-tracker-latest.apk"
                className="text-xs font-medium text-indigo-600 underline-offset-4 hover:underline"
              >
                {t["login.downloadApp"]}
              </a>
            </div>
          </CardContent>
        </Card>
      </main>
    </I18nProvider>
  );
}
