import { defineConfig, devices } from "@playwright/test";

// Read-only smoke tests against the LIVE production site. No webServer, no
// mutations — protects the real 942 tasks. Run:
//   npx playwright test --config playwright.live.config.ts
export default defineConfig({
  testDir: "./e2e-live",
  timeout: 45_000,
  retries: 1,
  reporter: "line",
  use: {
    baseURL: process.env.LIVE_URL ?? "https://tasks.coastshield.net",
    screenshot: "only-on-failure",
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Chromium at a phone viewport (WebKit engine isn't installed here)
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
