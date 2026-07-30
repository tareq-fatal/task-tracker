import type { MetadataRoute } from "next";
import { SITE_URL, languageAlternates } from "@/lib/seo";

// Only /login is a stable, indexable URL — everything else is auth-gated
// and redirects to it for anonymous visitors.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/login`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
      alternates: {
        languages: languageAlternates("/login"),
      },
    },
  ];
}
