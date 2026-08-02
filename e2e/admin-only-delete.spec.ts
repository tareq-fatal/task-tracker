import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

// Kundenwunsch 2026-08-02: ALLE Lösch-Aktionen sind admin-only. Non-Admins
// dürfen keinerlei Delete-Controls SEHEN (komplett ausgeblendet, nicht
// ausgegraut). Diese Spec prüft beide Sichten auf /list und der Task-Detail-
// Seite — den Flächen mit den vorher offenen Delete-Pfaden (Bulk-Delete,
// Subtasks, Zeiteinträge, Anhänge, Kommentare).

async function openFirstListTask(page: Page) {
  await page.goto("/list");
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();
  await page.locator('[data-testid="list-row"] a').first().click();
  await page.waitForURL(/\/tasks\//);
  await page.waitForTimeout(600); // hydrate
}

test("non-admin sees NO delete controls anywhere", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");

  // /list: bulk toolbar appears, but without the delete button
  await page.goto("/list");
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();
  await page.waitForTimeout(700); // hydrate
  await page.locator('[data-testid="list-row"] input[type="checkbox"]').first().check();
  await expect(page.getByText(/ausgewählt/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Löschen" })).toHaveCount(0);

  // task detail: no task delete, no subtask/time-entry trash icons
  await openFirstListTask(page);
  await expect(page.getByRole("button", { name: "Löschen", exact: true })).toHaveCount(0);
  await expect(page.locator('button[aria-label="delete"]')).toHaveCount(0); // subtasks
  await expect(page.locator('button[aria-label="Löschen"]')).toHaveCount(0); // time entries
});

// Kunden-Klarstellung 2026-08-02: Draft-Verwerfen ist KEIN Content-Löschen.
// Non-Admins müssen weiterhin Voice-Notes aufnehmen (und im Preview verwerfen)
// sowie Anhänge hochladen können — nur PERSISTIERTER Content ist admin-only.
test("non-admin still sees the draft/create paths (voice record + upload)", async ({ page }) => {
  await login(page, "alice", "Demo-2026!", "de");
  await openFirstListTask(page);
  await expect(page.getByRole("button", { name: "Sprachnotiz aufnehmen" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Datei hochladen" }).first()).toBeVisible();
});

test("admin sees and keeps all delete controls", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");

  // /list: bulk delete button present for admins
  await page.goto("/list");
  await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();
  await page.waitForTimeout(700);
  await page.locator('[data-testid="list-row"] input[type="checkbox"]').first().check();
  await expect(page.getByText(/ausgewählt/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Löschen" })).toBeVisible();

  // task detail: the destructive task delete button is visible
  await openFirstListTask(page);
  await expect(page.getByRole("button", { name: "Löschen" }).first()).toBeVisible();
});
