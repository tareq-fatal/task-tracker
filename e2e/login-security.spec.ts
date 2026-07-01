import { test, expect } from "@playwright/test";

// Regression guard: the login page must NEVER leak demo credentials by default
// (NEXT_PUBLIC_SHOW_DEMO_CREDENTIALS unset → hidden). Only fields + login button.
test("login page shows no credentials by default", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator('button[type="submit"]')).toBeVisible();
  await expect(page.getByText("Admin-2026!")).toHaveCount(0);
  await expect(page.getByText("Demo-2026!")).toHaveCount(0);
  await expect(page.getByText(/Demo-Zugänge|Demo accounts|حسابات تجريبية/)).toHaveCount(0);
  // no username hint in the field placeholder
  await expect(page.locator('#username')).not.toHaveAttribute("placeholder", "admin");
});
