import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

// TOF-0795 (Tarek 31.10.2026): zur Laufzeit erzeugen (APP_URL), nicht beim Build.
export const dynamic = "force-dynamic";

// The app is auth-gated everywhere except /login — keep crawl budget off
// tenant-scoped pages that would otherwise just 30x back to /login anyway.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/login"],
      disallow: [
        "/api/",
        "/admin",
        "/board",
        "/tasks",
        "/projects",
        "/reports",
        "/roadmap",
        "/sprints",
        "/settings",
        "/views",
        "/list",
        "/download/",
        "/t/",
        "/logout",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
