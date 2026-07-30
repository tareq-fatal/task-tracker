import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Tenant logos are uploaded at RUNTIME into the uploads volume. Next.js only
// serves public/ files it saw when it scanned the directory (once, lazily, at
// server start) — a logo uploaded afterwards 404s until the next restart.
// This route streams the logo straight from disk instead, so uploads show up
// immediately. Logos are public branding (login page included) — no auth, but
// the path is strictly whitelisted: known slug charset + logo.<known ext>.
const TYPES: Record<string, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(
  _req: Request,
  { params }: { params: { slug: string; file: string } }
) {
  const m = params.file.match(/^logo\.(png|svg|jpg|webp)$/);
  if (!m || !/^[a-z0-9-]{1,60}$/i.test(params.slug)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const abs = path.join(
    process.cwd(),
    "public",
    "uploads",
    "tenants",
    params.slug,
    params.file
  );
  const data = await readFile(abs).catch(() => null);
  if (!data) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(data, {
    headers: {
      "Content-Type": TYPES[m[1]],
      // The logo URL carries a ?v= cache-buster, so long client caching is safe.
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      // Belt-and-braces for SVG: even if opened directly, no scripts run.
      "Content-Security-Policy": "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
