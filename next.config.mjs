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
    name: process.env.SENTRY_RELEASE || "task-tracker@v3.0.0",
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
