import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/openapi";

// Serve the OpenAPI 3.1 document. Public (documents the public HTTP surface) and
// safe to cache. Powers the Swagger-UI page at /api-docs and any external
// tooling (Postman, openapi-generator, …).
// TOF-0795 (Tarek 31.10.2026): dynamisch statt beim Build vorgerendert — die
// Server-Adresse kommt zur Laufzeit aus APP_URL (src/lib/instance-url.ts).
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildOpenApiDocument(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
