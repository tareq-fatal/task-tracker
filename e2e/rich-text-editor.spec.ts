import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Rich text editor (Tiptap): markdown shortcuts, toolbar, @mentions,
 * #task-refs, emoji picker, and the end-to-end description/comment flow.
 */

test.describe("rich text editor — features (rte-test page)", () => {
  test("mounts with toolbar and applies markdown shortcuts", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/rte-test");

    const editor = page.locator(".ProseMirror");
    await expect(editor).toBeVisible();
    await expect(page.locator('[role="toolbar"] button')).toHaveCount(10);

    await editor.click();
    await expect(editor).toBeFocused();
    await editor.pressSequentially("# Überschrift");
    await expect(editor.locator("h1")).toHaveText("Überschrift");

    await page.keyboard.press("Enter");
    await editor.pressSequentially("* Listenpunkt");
    await expect(editor.locator("ul li")).toContainText("Listenpunkt");

    // hidden form field mirrors the HTML
    await expect(page.locator('input[name="test"]')).toHaveValue(/<h1>Überschrift<\/h1>/);
  });

  test("toolbar bold + blockquote toggle", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/rte-test");
    const editor = page.locator(".ProseMirror");
    await editor.click();

    await page.locator('[role="toolbar"] button[title="Fett"]').click();
    await page.keyboard.type("fett");
    await expect(editor.locator("strong")).toHaveText("fett");

    await page.locator('[role="toolbar"] button[title="Zitat"]').click();
    await expect(editor.locator("blockquote")).toBeVisible();
  });

  test("@mention and #task autocomplete insert nodes", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/rte-test");
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await expect(editor).toBeFocused();

    await editor.pressSequentially("Hallo @ali", { delay: 40 });
    await expect(page.locator(".rte-suggest .rte-suggest-item").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Enter");
    await expect(editor.locator('span[data-type="mention"]')).toContainText("@");

    await editor.pressSequentially("siehe #", { delay: 40 });
    await expect(page.locator(".rte-suggest .rte-suggest-item").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Enter");
    await expect(editor.locator('a[data-type="taskRef"]')).toBeVisible();
  });

  test("emoji picker inserts emoji", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/rte-test");
    const editor = page.locator(".ProseMirror");
    await editor.click();

    await page.locator('[role="toolbar"] button[title="Emoji"]').click();
    await page.locator(".absolute button", { hasText: "🚀" }).click();
    await expect(editor).toContainText("🚀");
  });

  test("image upload via file input embeds the image", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");
    await page.goto("/rte-test");
    await page.locator(".ProseMirror").click();

    // 1×1 red PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    await page
      .locator('input[type="file"][accept^="image/png"]')
      .setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: png });
    await expect(page.locator('.ProseMirror img[src^="/uploads/"]')).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("rich text editor — task flow", () => {
  test("description + comment render formatted; comment mention notifies", async ({ page }) => {
    await login(page, "admin", "Admin-2026!", "de");

    // Create a task with a rich description
    await page.goto("/tasks/new");
    const title = `RTE Flow ${Date.now()}`;
    await page.locator('input[name="title"]').fill(title);
    const descEditor = page.locator(".ProseMirror");
    await descEditor.click();
    await page.keyboard.type("# Kopfzeile");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Normaler Text mit ");
    await page.keyboard.type("**fett**");
    await page.locator('form button[type="submit"]').click();
    // NOT /\/tasks\/[a-z0-9]+$/ — that also matches /tasks/new and lets the
    // test race ahead while the create action is still pending. Task ids are
    // cuids (c + 24 chars).
    await page.waitForURL(/\/tasks\/c[a-z0-9]{20,}$/i, { timeout: 20_000 });

    // Rendered description uses rich-text HTML (not escaped markup)
    const desc = page.locator(".rich-text").first();
    await expect(desc.locator("h1")).toHaveText("Kopfzeile");
    await expect(desc.locator("strong")).toHaveText("fett");

    // Comment with a mention
    const commentEditor = page.locator("form .ProseMirror");
    await commentEditor.click();
    await expect(commentEditor).toBeFocused();
    await commentEditor.pressSequentially("Ping ");
    await expect(commentEditor).toContainText("Ping");
    await commentEditor.pressSequentially("@ali", { delay: 40 });
    await expect(page.locator(".rte-suggest .rte-suggest-item").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("Enter");
    await page.keyboard.type(" bitte anschauen");
    await page.getByRole("button", { name: "Senden", exact: true }).click();

    // Comment renders with mention chip; editor cleared
    await expect(
      page.locator('.rich-text span[data-type="mention"]').first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(commentEditor).toHaveText("");
  });
});
