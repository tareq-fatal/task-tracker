import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

// Admin-Workflow-Kontrolle (Kundenauftrag 2026-08-04, Features 1-3).
// Playwright-Beweis PFLICHT pro Feature — Screenshots landen in test-results
// via testInfo.attach UND als Dateien für den Bericht.
const SHOTS = "C:/Users/sapb1/AppData/Local/Temp/claude/C--Users-sapb1-source-Sy-task-tracker/5872cdd5-5c02-48ec-8dc1-6c5ac137e28a/scratchpad/shots";

// Erstes Öffnen als Assignee triggert den Read-Receipt (notify → WebPush/
// Telegram-Fetches serverseitig) — das "load"-Event kann dadurch >30s dauern.
test.setTimeout(120_000);

async function openTask(page: Page, id: string) {
  await page.goto(`/tasks/${id}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(1000);
}

async function adminCreatesTask(
  page: Page,
  title: string,
  opts: { targetColumn?: string; requireTodos?: boolean; requireTime?: boolean; todos?: string[] }
): Promise<string> {
  await page.goto("/tasks/new");
  await page.locator("#title").fill(title);
  // Assign to alice (علي) so she can open the task as a plain user.
  const aliceValue = await page
    .locator('select[name="assignedToUserId"] option', { hasText: "علي" })
    .first()
    .getAttribute("value");
  await page.locator('select[name="assignedToUserId"]').selectOption(aliceValue!);
  // Ziel-Spalte: default is "InProgress"; "" = frei.
  await page.locator('select[name="allowedTargetColumn"]').selectOption(opts.targetColumn ?? "");
  if (opts.requireTodos) await page.locator('input[name="requireAllTodosDone"]').check();
  if (opts.requireTime) await page.locator('input[name="requireTimeTracking"]').check();
  if (opts.todos) await page.locator("#todosBulk").fill(opts.todos.join("\n"));
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/tasks\/(?!new)[a-z0-9]+/i);
  const id = page.url().split("/tasks/")[1].split(/[/?#]/)[0];
  return id;
}

test("F1: Ziel-Spalte sperrt Nicht-Admins auf genau eine Spalte (Done bleibt Admin)", async ({ page }, testInfo) => {
  await login(page, "admin", "Admin-2026!", "de");
  const id = await adminCreatesTask(page, `WF-F1 ${Date.now()}`, { targetColumn: "InProgress" });

  await page.context().clearCookies(); // logout admin — /login redirects logged-in users
  await login(page, "alice", "Demo-2026!", "de");
  await openTask(page, id);

  // Status select shows ONLY current (Todo) + allowed target (InProgress) — no Done.
  const options = await page.locator('select[aria-label="Status"] option').allTextContents();
  expect(options).toContain("Zu erledigen");
  expect(options).toContain("In Arbeit");
  expect(options).not.toContain("Erledigt");

  const shot = `${SHOTS}/wf-f1-locked-select.png`;
  await page.screenshot({ path: shot, fullPage: false });
  await testInfo.attach("F1 locked status select", { path: shot, contentType: "image/png" });

  // Moving into the allowed column works.
  await page.locator('select[aria-label="Status"]').selectOption("InProgress");
  await page.waitForTimeout(1200);
  await expect(page.locator('select[aria-label="Status"]')).toHaveValue("InProgress");
});

test("F2: Done erst wenn alle Admin-Todos abgehakt sind", async ({ page }, testInfo) => {
  await login(page, "admin", "Admin-2026!", "de");
  const id = await adminCreatesTask(page, `WF-F2 ${Date.now()}`, {
    requireTodos: true,
    todos: ["Erste Sache", "Zweite Sache", "Dritte Sache"],
  });

  await page.context().clearCookies(); // logout admin — /login redirects logged-in users
  await login(page, "alice", "Demo-2026!", "de");
  await openTask(page, id);

  // The three admin todos exist, 0/3.
  await expect(page.getByText("Erste Sache")).toBeVisible();
  await expect(page.getByText("0/3")).toBeVisible();

  // Try Done → rejected with the todos message.
  await page.locator('select[aria-label="Status"]').selectOption("Done");
  await expect(page.getByText("Erst alle Unteraufgaben abhaken")).toBeVisible();
  const shot1 = `${SHOTS}/wf-f2-todos-blocked.png`;
  await page.screenshot({ path: shot1, fullPage: false });
  await testInfo.attach("F2 blocked while todos open", { path: shot1, contentType: "image/png" });

  // Check all three (server action + RSC refresh per click), then Done works.
  await page.waitForTimeout(600);
  for (let i = 0; i < 3; i++) {
    await page.locator('button[aria-label="toggle"]').nth(i).click();
    await page.waitForTimeout(1500);
  }
  await expect(page.getByText("3/3")).toBeVisible({ timeout: 15_000 });
  await page.locator('select[aria-label="Status"]').selectOption("Done");
  await page.waitForTimeout(1200);
  await expect(page.locator('select[aria-label="Status"]')).toHaveValue("Done");
  const shot2 = `${SHOTS}/wf-f2-todos-done.png`;
  await page.screenshot({ path: shot2, fullPage: false });
  await testInfo.attach("F2 done after all todos", { path: shot2, contentType: "image/png" });
});

test("F3: Done erst nach erfasster Zeit (manuell oder Timer)", async ({ page }, testInfo) => {
  await login(page, "admin", "Admin-2026!", "de");
  const id = await adminCreatesTask(page, `WF-F3 ${Date.now()}`, { requireTime: true });

  await page.context().clearCookies(); // logout admin — /login redirects logged-in users
  await login(page, "alice", "Demo-2026!", "de");
  await openTask(page, id);

  // Try Done without any logged time → rejected.
  await page.locator('select[aria-label="Status"]').selectOption("Done");
  await expect(page.getByText("Bitte zuerst Zeit erfassen")).toBeVisible();
  const shot1 = `${SHOTS}/wf-f3-time-blocked.png`;
  await page.screenshot({ path: shot1, fullPage: false });
  await testInfo.attach("F3 blocked without time", { path: shot1, contentType: "image/png" });

  // Log 2h manually via the existing time widget, then Done works.
  await page.waitForTimeout(600);
  await page.locator('input[name="duration"]').fill("2h");
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await page.waitForTimeout(1200);
  await page.locator('select[aria-label="Status"]').selectOption("Done");
  await page.waitForTimeout(1200);
  await expect(page.locator('select[aria-label="Status"]')).toHaveValue("Done");
  const shot2 = `${SHOTS}/wf-f3-time-done.png`;
  await page.screenshot({ path: shot2, fullPage: false });
  await testInfo.attach("F3 done after 2h logged", { path: shot2, contentType: "image/png" });
});
