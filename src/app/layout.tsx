import type { Metadata, Viewport } from "next";
import { Inter, Cairo } from "next/font/google";
import { getActiveLocale } from "@/lib/locale";
import { dirForLocale, LOCALES, type Locale } from "@/lib/enums";
import { translate } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

// og:locale wants language_TERRITORY tags matching our regional conventions.
const OG_LOCALE: Record<Locale, string> = {
  ar: "ar_EG",
  de: "de_DE",
  en: "en_US",
};

export function generateMetadata(): Metadata {
  const locale = getActiveLocale();
  const title = translate(locale, "app.name");
  const description = translate(locale, "meta.description");
  return {
    title,
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title,
    },
    icons: {
      icon: "/logo.svg",
      apple: "/icons/icon-192.png",
    },
    openGraph: {
      title,
      description,
      siteName: title,
      type: "website",
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter((l) => l !== locale).map(
        (l) => OG_LOCALE[l]
      ),
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // enables env(safe-area-inset-*) inside the APK
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getActiveLocale();
  const dir = dirForLocale(locale);
  const fontClass = locale === "ar" ? "font-cairo" : "font-sans";

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${inter.variable} ${cairo.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved theme before paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
      </head>
      <body className={`min-h-screen antialiased ${fontClass}`}>{children}</body>
    </html>
  );
}
