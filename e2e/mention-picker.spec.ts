import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// Typing "@" in the comment box opens the people picker; picking someone
// inserts their USERNAME (that's what the server resolves mentions by) and the
// posted comment notifies them.
test("@ opens the mention picker and inserts the username", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/board");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await page.waitForTimeout(1200); // let the comment form hydrate

  const box = page.locator('textarea[name="content"]');
  await box.click();
  await box.pressSequentially("Bitte anschauen @");

  const picker = page.locator('[data-testid="mention-picker"]');
  await expect(picker).toBeVisible({ timeout: 8000 });

  // the first suggestion carries "@username" — remember it, then pick it
  const first = page.locator('[data-testid="mention-option"]').first();
  const suggested = (await first.innerText()).trim();
  const username = suggested.match(/@([a-zA-Z0-9_.-]+)/)?.[1];
  expect(username, "suggestion shows an @username").toBeTruthy();

  await first.click();
  await expect(picker).toBeHidden();
  await expect(box).toHaveValue(`Bitte anschauen @${username} `);

  // Escape closes the picker without inserting anything
  await box.pressSequentially("@");
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();

  // the comment posts with the mention intact
  const note = ` Mention-Test ${Date.now().toString().slice(-6)}`;
  await box.pressSequentially(note);
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByText(note.trim()).first()).toBeVisible({ timeout: 8000 });
});

// An email address must not trigger the picker — same rule as the server-side
// parser, which ignores "@" preceded by a username character.
test("an email address does not open the mention picker", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await page.goto("/board");
  await page.locator('a[href^="/tasks/"]:not([href$="/new"])').first().click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await page.waitForTimeout(1200);

  const box = page.locator('textarea[name="content"]');
  await box.click();
  await box.pressSequentially("schreib an tarek@");
  await expect(page.locator('[data-testid="mention-picker"]')).toBeHidden();
});
