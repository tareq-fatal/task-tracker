import type { Metadata } from "next";
import { OPENAPI_SPEC_PATH, isOfflineMode } from "@/lib/offline";
import { SwaggerUi } from "./swagger-ui";

// TOF-0794 (Tarek 31.10.2026): Swagger-UI kommt von unpkg.com. Im Offline-Betrieb
// (TT_OFFLINE=1) gibt es das nicht — dann nur ein Hinweis + Link auf die lokale
// Spezifikation, KEIN Abruf nach außen. Zur Laufzeit gelesen → force-dynamic
// (sonst würde der Build-Zeitpunkt entscheiden).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "API Docs" };

export default function ApiDocsPage() {
  if (isOfflineMode()) {
    return (
      <main dir="ltr" style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 720 }}>
        <h1 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>API documentation (offline mode)</h1>
        <p style={{ marginBottom: "0.75rem" }}>
          This installation runs without internet access, so the interactive Swagger-UI (loaded from a
          public CDN) is switched off.
        </p>
        <p>
          The complete OpenAPI specification is served locally:{" "}
          <a href={OPENAPI_SPEC_PATH} style={{ color: "#0369a1", textDecoration: "underline" }}>
            {OPENAPI_SPEC_PATH}
          </a>
          . Open it with any OpenAPI tool (Postman, Insomnia, a local Swagger-UI, …).
        </p>
      </main>
    );
  }
  return <SwaggerUi />;
}
