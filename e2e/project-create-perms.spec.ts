import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #37 — only admins may create projects; users can't see the create button.
test("admin sees the New Project button", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/projects");
  await expect(page.getByRole("button", { name: "Neues Projekt" }).first()).toBeVisible();
});

test("a regular user has no New Project button", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projekte" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Neues Projekt/ })).toHaveCount(0);
});
