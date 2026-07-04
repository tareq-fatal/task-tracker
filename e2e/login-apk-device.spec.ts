import { test, expect } from "@playwright/test";

// #38 — the APK download link shows on desktop only; mobile gets a PWA hint.
test("desktop login shows the APK download link", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.locator('a[href="/download/task-tracker-latest.apk"]')
  ).toBeVisible();
});

test.describe("mobile", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36",
  });

  test("Android login hides the APK link (shows install hint instead)", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.locator('a[href="/download/task-tracker-latest.apk"]')
    ).toHaveCount(0);
    // the PWA install affordance (📲, locale-independent) is shown instead
    await expect(page.getByText(/📲/).first()).toBeVisible();
  });
});

test.describe("ios", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test("iOS login hides the APK link (can't run an APK)", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.locator('a[href="/download/task-tracker-latest.apk"]')
    ).toHaveCount(0);
  });
});
