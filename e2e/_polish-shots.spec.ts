import { test } from "@playwright/test";
import { login } from "./helpers";

// Capture-only: APK-polish before/after shots. Run with SHOTS=1.
// Output dir via SHOT_DIR (default screenshots/apk-polish/after).
const DIR = process.env.SHOT_DIR ?? "screenshots/apk-polish/after";

test.describe("apk polish shots", () => {
  test.skip(!process.env.SHOTS, "capture-only (set SHOTS=1)");
  // Pixel-class portrait, 2x DPR for crisp text.
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });

  const shot = async (page: any, name: string) =>
    page.screenshot({ path: `${DIR}/${name}.png` });

  const setTheme = (page: any, dark: boolean) =>
    page.evaluate((d: boolean) => {
      localStorage.setItem("theme", d ? "dark" : "light");
      document.documentElement.classList.toggle("dark", d);
    }, dark);

  test("mobile notification + scroll-progress", async ({ page }) => {
    test.setTimeout(120000);
    await login(page, "admin", "Admin-2026!", "de");

    // ── Notifications: header + open the sheet (light) ──────────────────
    await page.goto("/");
    await page.waitForTimeout(1200); // let the bell poll + badge settle
    await shot(page, "01-header-badge");

    const bell = page.getByRole("button", { name: "Benachrichtigungen" });
    await bell.click();
    await page.waitForTimeout(700);
    await shot(page, "02-notif-sheet-light");

    // ── Swipe a card partway to reveal the delete affordance ────────────
    // (Only exists in the redesigned "after" build; tolerated otherwise.)
    const firstCard = page.locator('.tt-sheet-up [role="button"]').first();
    const hasSheet = await firstCard
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    const box = hasSheet ? await firstCard.boundingBox() : null;
    if (box) {
      const cy = box.y + box.height / 2;
      await page.mouse.move(box.x + box.width - 24, cy);
      await page.mouse.down();
      // Drag left past the 72px threshold to reveal the red delete affordance.
      await page.mouse.move(box.x + box.width - 24, cy); // prime pointerdown
      await page.mouse.move(box.x + 70, cy, { steps: 14 });
      await page.waitForTimeout(300);
      await shot(page, "03-notif-swipe-delete");
      await page.mouse.up();
    }
    await page.waitForTimeout(400);

    // ── Notifications sheet (dark) ──────────────────────────────────────
    await setTheme(page, true);
    await page.waitForTimeout(300);
    await shot(page, "04-notif-sheet-dark");

    // close sheet
    await page.keyboard.press("Escape").catch(() => {});
    await page.mouse.click(206, 60).catch(() => {});
    await setTheme(page, false);

    // ── Scroll-progress on a long list ──────────────────────────────────
    await page.goto("/list");
    await page.waitForTimeout(1000);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(500);
    await shot(page, "05-scroll-progress-light");

    await setTheme(page, true);
    await page.waitForTimeout(300);
    await shot(page, "06-scroll-progress-dark");
    await setTheme(page, false);
  });

  test("arabic RTL notification sheet", async ({ page }) => {
    test.setTimeout(90000);
    await login(page, "admin", "Admin-2026!", "ar");
    await page.goto("/");
    await page.waitForTimeout(1200);
    const bell = page.getByRole("button").filter({ hasText: "" }).first();
    // open by aria-label (arabic)
    await page.getByRole("button", { name: "الإشعارات" }).click().catch(async () => {
      await bell.click();
    });
    await page.waitForTimeout(700);
    await shot(page, "07-notif-sheet-rtl");

    await page.goto("/list");
    await page.waitForTimeout(900);
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(500);
    await shot(page, "08-scroll-progress-rtl");
  });
});
