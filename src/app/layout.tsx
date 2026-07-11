import type { Metadata, Viewport } from "next";
import { Inter, Cairo } from "next/font/google";
import { getActiveLocale } from "@/lib/locale";
import { dirForLocale } from "@/lib/enums";
import { SITE_URL, SEO_COPY, OG_LOCALE } from "@/lib/seo";
import { AnalyticsScript } from "@/components/analytics-script";
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

export function generateMetadata(): Metadata {
  const locale = getActiveLocale();
  const copy = SEO_COPY[locale];

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: copy.title, template: `%s · ${copy.appName}` },
    description: copy.description,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: copy.appName,
    },
    icons: {
      icon: "/logo.svg",
      apple: "/icons/icon-192.png",
    },
    // Everything except /login lives behind auth — keep it out of indexes by
    // default; /login opts back in via its own generateMetadata.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: copy.appName,
      title: copy.title,
      description: copy.description,
      url: SITE_URL,
      locale: OG_LOCALE[locale],
      // Child routes overriding `openGraph` replace this object wholesale,
      // so each generateMetadata that sets openGraph must repeat `images`.
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: copy.appName }],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.description,
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
        <AnalyticsScript />
      </head>
      <body className={`min-h-screen antialiased ${fontClass}`}>{children}</body>
    </html>
  );
}
