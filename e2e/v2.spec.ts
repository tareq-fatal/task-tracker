import { test, expect } from "@playwright/test";
import { login } from "./helpers";

async function newTask(page: any, title: string) {
  await page.goto("/tasks/new");
  await page.getByLabel(/Titel/i).fill(title);
  await page.getByRole("button", { name: /Task erstellen|Create task/i }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
}

test("subtasks drive auto progress", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await newTask(page, `Subtasks ${Date.now()}`);

  const input = page.getByPlaceholder("Element hinzufügen…");
  await input.fill("Erstes Item");
  await input.press("Enter");
  await expect(page.getByText("Erstes Item")).toBeVisible();

  await input.fill("Zweites Item");
  await input.press("Enter");
  await expect(page.getByText("Zweites Item")).toBeVisible();
  await expect(page.getByText("0/2", { exact: true })).toBeVisible();

  // toggle the first subtask done → 1 of 2 = 50%
  await page.getByRole("button", { name: "toggle" }).first().click();
  await expect(page.getByText("1/2", { exact: true })).toBeVisible();
  // subtasks drive progress → bar reflects 1 of 2 done
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "50"
  );
});

test("manual progress quick button sets the bar", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await newTask(page, `Progress ${Date.now()}`);

  await page.getByRole("button", { name: "75%" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "75"
  );
});

test("timer start shows the stop button", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  await newTask(page, `Timer ${Date.now()}`);

  await page.getByRole("button", { name: /Timer starten/i }).click();
  await expect(
    page.getByRole("button", { name: /Timer stoppen/i })
  ).toBeVisible();
});
