import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

test("Arabic is the default: html is lang=ar dir=rtl with Arabic login", async ({
  page,
}) => {
  // No locale cookie → default Arabic
  await page.context().clearCookies();
  await page.goto("/login");

  const html = page.locator("html");
  await expect(html).toHaveAttribute("dir", "rtl");
  await expect(html).toHaveAttribute("lang", "ar");

  // Arabic app name + login button
  await expect(page.getByText("متعقب المهام")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "تسجيل الدخول" })
  ).toBeVisible();
});

test("Arabic board shows RTL columns and Arabic labels", async ({ page }) => {
  await page.context().clearCookies();
  await login(page, "admin", "Admin-2026!");
  await page.goto("/board");

  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("للتنفيذ")).toBeVisible(); // To do
  await expect(page.getByText("قيد التنفيذ")).toBeVisible(); // In progress
  await expect(page.getByText("مكتمل")).toBeVisible(); // Done
});

test("language switch to English flips dir to ltr", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(
    page.getByRole("heading", { name: /My Tasks/i })
  ).toBeVisible();
});
