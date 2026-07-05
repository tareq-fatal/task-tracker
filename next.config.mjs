import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // A new SW must take over immediately and control open tabs right away —
    // otherwise a stale worker keeps serving cached assets until every tab
    // with the old version is closed, which is what caused the "still on the
    // old version after deploy" reports.
    skipWaiting: true,
    clientsClaim: true,
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
