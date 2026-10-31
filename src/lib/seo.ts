import type { Locale } from "./enums";
import { applyBrandToSeo, BRAND_NAME, runtimeBrandName } from "./brand";
import { SITE_URL, instanceUrl } from "./instance-url";

/** Public base URL (Build-Zeit) — siehe src/lib/instance-url.ts.
 *
 * `||`, not `??`: NEXT_PUBLIC_APP_URL is inlined at build time, so a build that
 * passes it as an empty string (an unset `--build-arg`) leaves `""` rather than
 * `undefined`. With `??` that empty string wins and every `new URL(SITE_URL)`
 * throws "Invalid URL", 500-ing every page.
 *
 * TOF-0795 (Tarek 31.10.2026): serverseitig zur Laufzeit `siteUrl()` benutzen —
 * APP_URL > NEXT_PUBLIC_APP_URL > SITE_URL. Ohne APP_URL identisch mit SITE_URL. */
export { SITE_URL };

/** Laufzeit-Basisadresse für canonical/OG/sitemap/robots (ohne „/“ am Ende). */
export function siteUrl(): string {
  const u = instanceUrl();
  try {
    new URL(u); // eine kaputte APP_URL darf keine Seite mit „Invalid URL“ abstürzen lassen
    return u;
  } catch {
    return SITE_URL.replace(/\/+$/, "");
  }
}

type SeoCopy = {
  appName: string;
  title: string;
  description: string;
};

/** Trilingual metadata copy, independent from the UI dictionary in `i18n.ts`. */
export const SEO_COPY: Record<Locale, SeoCopy> = applyBrandToSeo({
  ar: {
    appName: "متعقب المهام",
    title: "متعقب المهام — إدارة المهام والمشاريع للفرق",
    description:
      "متعقب المهام: تطبيق خفيف متعدد المؤسسات لإدارة المهام والمشاريع، بلوحات كانبان وسبرنتات وخارطة طريق وعمل جماعي.",
  },
  en: {
    appName: "Task Tracker",
    title: "Task Tracker — Team Task & Project Management",
    description:
      "Task Tracker is a lightweight, multi-tenant task and project management app — Kanban boards, sprints, roadmaps and team collaboration.",
  },
  de: {
    appName: "Task Tracker",
    title: "Task Tracker — Aufgaben- & Projektmanagement fürs Team",
    description:
      "Task Tracker ist eine schlanke, mandantenfähige App für Aufgaben- und Projektmanagement mit Kanban-Boards, Sprints, Roadmaps und Teamarbeit.",
  },
  tr: {
    appName: "Görev Takibi",
    title: "Görev Takibi — Ekipler için Görev ve Proje Yönetimi",
    description:
      "Görev Takibi; Kanban panoları, sprintler, yol haritaları ve ekip çalışmasıyla hafif, çok kiracılı bir görev ve proje yönetimi uygulamasıdır.",
  },
}, BRAND_NAME); // TOF-0791: Instanz-Name (Build), leer = unverändert

/**
 * TOF-0795: SEO-Texte einer Sprache mit dem LAUFZEIT-Namen (APP_NAME). Erst beim
 * Aufruf ausgewertet — ohne APP_NAME exakt SEO_COPY[locale].
 */
export function seoCopy(locale: Locale): SeoCopy {
  const base = SEO_COPY[locale] ?? SEO_COPY.de;
  const name = runtimeBrandName();
  if (!name || name === base.appName) return base;
  return applyBrandToSeo({ x: { ...base } }, name).x;
}

/** Open Graph locale codes (BCP-47-ish `og:locale` format). */
export const OG_LOCALE: Record<Locale, string> = {
  ar: "ar_AR",
  en: "en_US",
  de: "de_DE",
  tr: "tr_TR",
};

/**
 * hreflang alternates for a path. The app has no locale-prefixed routes —
 * locale is normally cookie-driven — so `?lang=` is the crawlable, distinct
 * URL per language (read by the page to render that locale server-side).
 */
export function languageAlternates(path: string): Record<string, string> {
  const base = siteUrl();
  return {
    ar: `${base}${path}?lang=ar`,
    en: `${base}${path}?lang=en`,
    de: `${base}${path}?lang=de`,
    "x-default": `${base}${path}`,
  };
}
