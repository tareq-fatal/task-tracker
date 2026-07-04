import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("login page shows the Android app download link", async ({ page }) => {
  await page.goto("/login");
  const link = page.getByRole("link", { name: /Android-App|Download Android|أندرويد/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/download/task-tracker-latest.apk");
});

test("settings shows the mobile-app download button (any user)", async ({
  page,
}) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/settings");
  await expect(page.getByText("Mobile-App")).toBeVisible();
  const dl = page.getByRole("link", { name: /APK herunterladen/ });
  await expect(dl).toHaveAttribute("href", "/download/task-tracker-latest.apk");
  // beta/debug-key notice present
  await expect(page.getByText(/Debug-Key signiert/)).toBeVisible();
});
