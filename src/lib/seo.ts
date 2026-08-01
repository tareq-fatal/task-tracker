import type { Locale } from "./enums";

/** Public base URL — used for canonical links, sitemap, OG/JSON-LD absolute URLs.
 *
 * `||`, not `??`: NEXT_PUBLIC_APP_URL is inlined at build time, so a build that
 * passes it as an empty string (an unset `--build-arg`, e.g. the self-hosted
 * installer's pre-built image) leaves `""` here rather than `undefined`. With
 * `??` that empty string wins and every `new URL(SITE_URL)` below throws
 * "Invalid URL", 500-ing every page. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://tasks.coastshield.net";

type SeoCopy = {
  appName: string;
  title: string;
  description: string;
};

/** Trilingual metadata copy, independent from the UI dictionary in `i18n.ts`. */
export const SEO_COPY: Record<Locale, SeoCopy> = {
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
};

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
  return {
    ar: `${SITE_URL}${path}?lang=ar`,
    en: `${SITE_URL}${path}?lang=en`,
    de: `${SITE_URL}${path}?lang=de`,
    "x-default": `${SITE_URL}${path}`,
  };
}
