import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Read-only coverage of the global keyboard shortcuts (#N/E/D//, G+K/S/T, ?, j/k).
// Delete (D) reuses the proven confirm()+deleteTaskAction path of DeleteTaskButton
// and is intentionally not exercised here to keep the spec non-mutating.

test.describe("keyboard shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
  });

  test("? toggles the cheatsheet and Esc closes it", async ({ page }) => {
    await page.keyboard.press("Shift+Slash"); // "?"
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Tastaturkürzel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("N opens the new-task form", async ({ page }) => {
    await page.keyboard.press("n");
    await page.waitForURL("**/tasks/new");
  });

  test("/ focuses the search input", async ({ page }) => {
    await page.goto("/board");
    await page.keyboard.press("Slash");
    await expect(page.locator('input[data-shortcut="search"]')).toBeFocused();
  });

  test("G+K goes to the board, G+S to sprints", async ({ page }) => {
    await page.keyboard.press("g");
    await page.keyboard.press("k");
    await page.waitForURL("**/board");
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await page.waitForURL("**/sprints");
  });

  test("j selects a task card and E opens its edit page", async ({ page }) => {
    await page.goto("/board");
    await page.locator('a[href^="/tasks/"]').first().waitFor();
    const selected = page.locator("a[data-kbd-selected]");
    // The board is DOM-heavy (~950 cards) — the SSR markup is up long before
    // React hydration attaches the global key listener. Re-press until it bites
    // (extra presses just move the selection; the count stays 1).
    await expect(async () => {
      await page.keyboard.press("j");
      await expect(selected).toHaveCount(1, { timeout: 1000 });
    }).toPass({ timeout: 30000 });
    const href = await selected.getAttribute("href");
    await page.keyboard.press("e");
    await page.waitForURL(`**${href}/edit`);
  });

  test("shortcuts stay inert while typing in an input", async ({ page }) => {
    await page.goto("/board");
    const search = page.locator('input[data-shortcut="search"]');
    await search.click();
    await search.fill("n");
    // typing "n" must NOT navigate to /tasks/new
    await page.waitForTimeout(300);
    expect(page.url()).toContain("/board");
    // Esc blurs the field
    await page.keyboard.press("Escape");
    await expect(search).not.toBeFocused();
  });
});
