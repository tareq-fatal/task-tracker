import { test, expect } from "@playwright/test";
import { login, useLocale } from "./helpers";

// Project page — "add existing tasks" picker attaches an already-created task
// to the project; the task edit form can move it back out (project select).
// Covers task ↔ project in both directions.
test("attach an existing task via the project picker, detach via the edit form", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await useLocale(page, "de");

  // 1) create a project-less probe task through the normal form
  const probe = `TT-LINK-PROBE-${Date.now()}`;
  await page.goto("/tasks/new");
  await page.locator("#title").fill(probe);
  await page.locator("#projectId").selectOption("");
  await page.getByRole("button", { name: "Task erstellen" }).click();
  // cuid segment — long enough not to match /tasks/new itself
  await page.waitForURL(/\/tasks\/[a-z0-9]{20,}/);
  const taskUrl = page.url();

  // 2) project page → picker → attach the probe task
  await page.goto("/projects");
  await page.locator('a[href^="/projects/"]').first().click();
  await page.waitForURL(/\/projects\/[a-z0-9]+/);
  const projectUrl = page.url();
  await page.getByRole("button", { name: "Bestehende Aufgaben hinzufügen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Suchen…").fill(probe);
  await dialog.getByRole("checkbox").first().check();
  await dialog.getByRole("button", { name: "Hinzufügen (1)" }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(probe).first()).toBeVisible({ timeout: 15_000 });

  // 3) other direction: edit form → project select back to "Kein Projekt"
  await page.goto(taskUrl + "/edit");
  await expect(page.locator("#projectId")).not.toHaveValue("");
  await page.locator("#projectId").selectOption("");
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.waitForURL(/\/tasks\/[a-z0-9]{20,}$/);

  await page.goto(projectUrl);
  await expect(page.getByText(probe)).toHaveCount(0);
});
