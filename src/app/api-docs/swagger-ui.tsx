"use client";

import { useEffect, useRef, useState } from "react";

// TOF-0794: only rendered when TT_OFFLINE is NOT set (see page.tsx).
// Swagger-UI rendered from the pinned CDN bundle (swagger-ui-dist). Loading the
// assets at runtime keeps them out of the app bundle and the service-worker
// precache. The spec itself is served locally from /api/openapi.json.
const SWAGGER_VERSION = "5.17.14";
const CSS_HREF = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`;
const JS_SRC = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`;

declare global {
  interface Window {
    SwaggerUIBundle?: (opts: Record<string, unknown>) => unknown;
  }
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (window.SwaggerUIBundle) resolve();
      else existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

export function SwaggerUi() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    document.title = "API Docs · Task Tracker";
    loadCss(CSS_HREF);
    loadScript(JS_SRC)
      .then(() => {
        if (cancelled || !window.SwaggerUIBundle) return;
        window.SwaggerUIBundle({
          url: "/api/openapi.json",
          domNode: containerRef.current,
          deepLinking: true,
          docExpansion: "list",
          defaultModelsExpandDepth: 1,
          tryItOutEnabled: true,
          persistAuthorization: true,
        });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main dir="ltr" style={{ background: "#fafafa", minHeight: "100vh" }}>
      <noscript>Enable JavaScript to view the interactive API documentation.</noscript>
      {error && (
        <p style={{ padding: "1rem", color: "#b91c1c", fontFamily: "system-ui, sans-serif" }}>
          Could not load Swagger-UI ({error}). The raw specification is available at{" "}
          <a href="/api/openapi.json">/api/openapi.json</a>.
        </p>
      )}
      <div ref={containerRef} id="swagger-ui" />
    </main>
  );
}
