import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

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
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
