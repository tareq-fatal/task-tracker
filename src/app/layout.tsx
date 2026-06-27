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
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <body className={`min-h-screen antialiased ${fontClass}`}>{children}</body>
    </html>
  );
}
