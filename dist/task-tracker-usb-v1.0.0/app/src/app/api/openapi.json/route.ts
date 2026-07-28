import { NextResponse } from "next/server";
import { openApiDocument } from "@/lib/openapi";

// Serve the OpenAPI 3.1 document. Public (documents the public HTTP surface) and
// static — safe to cache. Powers the Swagger-UI page at /api-docs and any external
// tooling (Postman, openapi-generator, …).
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(openApiDocument, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
