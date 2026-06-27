import { test, expect } from "@playwright/test";

test("login renders the new brand mark + wordmark", async ({ page }) => {
  await page.goto("/login");
  // gradient logo mark (inline SVG using the tt-mark gradient) is present
  await expect(page.locator("svg rect[fill^='url(#tt-mark']").first()).toBeVisible();
  // a gradient CTA button is present (the brand "from-indigo-500 to-pink-500")
  await expect(page.locator('button[type="submit"]')).toBeVisible();
});
