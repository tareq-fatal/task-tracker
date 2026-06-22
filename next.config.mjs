import withPWAInit from "@ducanh2912/next-pwa";

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
  experimental: {
    // Native (.node) and Prisma packages must not be bundled by webpack.
    serverComponentsExternalPackages: ["@node-rs/argon2", "@prisma/client"],
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default withPWA(nextConfig);
