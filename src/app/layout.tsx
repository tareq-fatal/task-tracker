import type { Metadata, Viewport } from "next";
import { Inter, Cairo } from "next/font/google";
import { getActiveLocale } from "@/lib/locale";
import { dirForLocale } from "@/lib/enums";
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

export const metadata: Metadata = {
  title: "متعقب المهام · Task Tracker",
  description: "تطبيق خفيف لتتبّع المهام — لوحات ومشاريع وعمل جماعي.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "متعقب المهام",
  },
  icons: {
    icon: "/logo.svg",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0e121b" }, // = --background dark
  ],
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
        {/* Apply the saved theme before paint (no flash), follow OS changes
            app-wide while in "system" mode, and sync across tabs. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=window.matchMedia('(prefers-color-scheme:dark)');function a(){var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&m.matches);document.documentElement.classList.toggle('dark',d);}a();if(m.addEventListener)m.addEventListener('change',a);window.addEventListener('storage',function(e){if(!e.key||e.key==='theme')a();});}catch(e){}})();",
          }}
        />
      </head>
      <body className={`min-h-screen antialiased ${fontClass}`}>{children}</body>
    </html>
  );
}
