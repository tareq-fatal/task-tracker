import { redirect } from "next/navigation";
import Image from "next/image";
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

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const locale = getActiveLocale();
  const t = getDictionary(locale);

  return (
    <I18nProvider locale={locale}>
      <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-teal-50 p-4">
        <div className="absolute end-4 top-4">
          <LocaleSwitcher current={locale} />
        </div>
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="items-center text-center">
            <Image
              src="/logo.svg"
              alt=""
              width={56}
              height={56}
              className="mb-2"
              priority
            />
            <CardTitle className="text-2xl">{t["app.name"]}</CardTitle>
            <CardDescription>{t["login.subtitle"]}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
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
          </CardContent>
        </Card>
      </main>
    </I18nProvider>
  );
}
