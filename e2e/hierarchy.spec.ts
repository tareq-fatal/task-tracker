import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("task form exposes type, story points and parent", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/tasks/new");
  await expect(page.locator("select#type")).toBeVisible();
  await expect(page.locator("#storyPoints")).toBeVisible();
  await expect(page.locator("select#parentId")).toBeVisible();
});

test("creating an Epic with story points shows the type badge + SP on detail", async ({
  page,
}) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/tasks/new");
  await page.locator("#title").fill("Hierarchy Epic smoke");
  await page.locator("select#type").selectOption("Epic");
  await page.locator("#storyPoints").fill("5");
  await page.getByRole("button", { name: /erstellen|speichern|create|save/i }).click();
  await page.waitForURL((u) => /\/tasks\//.test(u.pathname) && !u.pathname.endsWith("/new"));
  await expect(page.getByText("5 SP")).toBeVisible();
  await expect(page.getByText("Epic").first()).toBeVisible(); // type badge "⚡ Epic"
});
