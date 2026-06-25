import type { CapacitorConfig } from "@capacitor/cli";

// Task Tracker is a SERVER-RENDERED Next.js app (server actions, Prisma, cookie
// auth) — it cannot be exported to a static webDir. The native shell therefore
// loads the live PWA over https and adds native plugins (camera, push, files,
// network). Override the host for staging with CAP_SERVER_URL at build time.
const config: CapacitorConfig = {
  appId: "net.coastshield.tasktracker",
  appName: "Task Tracker",
  webDir: "public", // required by the CLI even when server.url is set
  server: {
    url: process.env.CAP_SERVER_URL || "https://tasks.coastshield.net",
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
