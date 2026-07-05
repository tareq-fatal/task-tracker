import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveLocale } from "@/lib/locale";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/enums";
import { SITE_URL, SEO_COPY, OG_LOCALE, languageAlternates } from "@/lib/seo";
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
import { ApkDownloadLink } from "@/components/apk-download-link";
import { SsoButtons } from "@/components/sso-buttons";
import { configuredProviders } from "@/lib/sso";

type LoginSearchParams = { sso?: string; lang?: string };

// No locale-prefixed routes exist app-wide; `?lang=` gives crawlers a
// distinct, indexable URL per language (rendered for real below, not just
// in metadata) so the hreflang alternates point at genuinely different content.
export function generateMetadata({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}): Metadata {
  const locale = isLocale(searchParams?.lang) ? searchParams.lang : getActiveLocale();
  const copy = SEO_COPY[locale];
  const url = `${SITE_URL}/login`;

  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical: url,
      languages: languageAlternates("/login"),
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url,
      title: copy.title,
      description: copy.description,
      locale: OG_LOCALE[locale],
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: copy.appName }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
    },
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const locale = isLocale(searchParams?.lang) ? searchParams.lang : getActiveLocale();
  const t = getDictionary(locale);
  const copy = SEO_COPY[locale];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: copy.appName,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Android",
    url: `${SITE_URL}/login`,
    description: copy.description,
    inLanguage: ["ar", "en", "de"],
  };
  const providers = configuredProviders();
  const ssoError = Boolean(searchParams?.sso);
  // Demo credentials are hidden by default and NEVER shown in production. Opt in
  // for local/demo environments with NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS=true.
  const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS === "true";

  return (
    <I18nProvider locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
            {showDemo && (
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
            )}
            <ApkDownloadLink />
          </CardContent>
        </Card>
      </main>
    </I18nProvider>
  );
}
