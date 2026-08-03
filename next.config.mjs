import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained build for Docker: emits .next/standalone with a minimal
  // server.js + only the traced node_modules. Keeps the runtime image small.
  output: "standalone",
  // Behind Caddy (reverse proxy) — trust the X-Forwarded-* headers it sets.
  poweredByHeader: false,
  compress: true,
  // ── Sicherheits-Header (Härtung 2026-08-03) ──────────────────────────────
  // Cloudflare setzt bereits HSTS; alles Weitere muss die Anwendung liefern.
  // Bewusst KEINE CSP hier: die App lädt Karten-/Chart-Assets und nutzt
  // Inline-Styles aus Tailwind-Runtime; eine CSP will erst gegen die echte
  // Seite getestet werden, sonst bricht sie den Betrieb (siehe Reports, wo
  // sie per Hash sauber eingeführt wurde).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  experimental: {
    // Native (.node) and Prisma packages must not be bundled by webpack.
    serverComponentsExternalPackages: ["@node-rs/argon2", "@prisma/client"],
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default withSentryConfig(withPWA(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Only present in CI/deploy environments — source maps upload is skipped
  // (with a warning) if this is unset, so local dev builds are unaffected.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Tags every event + uploaded source map with the same release so stack
  // traces symbolicate against the right build.
  release: {
    name: process.env.SENTRY_RELEASE || "task-tracker@v3.1.0",
  },

  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Source maps are only needed by Sentry, not for shipping to the browser.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },

  // Skips Sentry's own build-time telemetry ping.
  telemetry: false,
});
