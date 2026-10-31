import type { MetadataRoute } from "next";
import { siteUrl, languageAlternates } from "@/lib/seo";

// TOF-0795 (Tarek 31.10.2026): zur Laufzeit erzeugen (APP_URL), nicht beim Build.
export const dynamic = "force-dynamic";

// Only /login is a stable, indexable URL — everything else is auth-gated
// and redirects to it for anonymous visitors.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl()}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
      alternates: {
        languages: languageAlternates("/login"),
      },
    },
  ];
}
