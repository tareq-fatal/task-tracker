import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  // Custom entries below are checked BEFORE the plugin's default cache rules.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // The realtime SSE stream (and its cursor uplink) must NEVER be touched
      // by the service worker: caching an infinite event-stream buffers it
      // forever and breaks EventSource reconnects.
      {
        urlPattern: ({ url }) => url.pathname.startsWith("/api/realtime"),
        handler: "NetworkOnly",
      },
    ],
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

export default withPWA(nextConfig);
