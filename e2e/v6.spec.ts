import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("regular user is blocked from admin pages (server-side)", async ({
  page,
}) => {
  await login(page, "alice", "Demo-2026!", "de");
  for (const p of ["/admin/tasks", "/admin/users", "/admin/teams"]) {
    await page.goto(p);
    await expect(page).toHaveURL("/");
  }
});

test("regular user task form has no assignee field", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/tasks/new");
  await expect(page.getByText("Zugewiesen an")).toHaveCount(0);
  // but can still create (assigned to self server-side)
  await page.getByLabel(/Titel/i).fill(`Self ${Date.now()}`);
  await page.getByRole("button", { name: /Task erstellen/ }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
});

test("admin can link two tasks (dependency)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  const aTitle = `Dep A ${Date.now()}`;
  await page.goto("/tasks/new");
  await page.getByLabel(/Titel/i).fill(aTitle);
  await page.getByRole("button", { name: /Task erstellen/ }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);

  const bTitle = `Dep B ${Date.now()}`;
  await page.goto("/tasks/new");
  await page.getByLabel(/Titel/i).fill(bTitle);
  await page.getByRole("button", { name: /Task erstellen/ }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);

  // On B's detail, link "Depends on" → A
  const taskSelect = page.locator("select", {
    has: page.locator("option", { hasText: aTitle }),
  });
  await taskSelect.selectOption({ label: aTitle });
  await page.getByRole("button", { name: /Verlinkung hinzufügen/ }).click();

  // the linked task appears in the Links section
  await expect(page.getByRole("link", { name: aTitle })).toBeVisible();
});
