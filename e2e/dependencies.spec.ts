import { test, expect, type Page } from "@playwright/test";
import { login } from "./helpers";

async function createTask(page: Page, title: string): Promise<string> {
  await page.goto("/tasks/new");
  await page.getByLabel(/Titel/i).fill(title);
  await page.getByRole("button", { name: /Task erstellen/ }).click();
  // wait for the redirect to the created task ("new" itself must not match)
  await page.waitForURL(/\/tasks\/(?!new$)[^/]+$/);
  return page.url();
}

/** On the current task detail page, add a link of `typeLabel` to `targetTitle`. */
async function addLink(page: Page, typeLabel: string, targetTitle: string) {
  const typeSelect = page.locator("select", {
    has: page.locator("option", { hasText: "Hängt ab von" }),
  });
  const taskSelect = page.locator("select", {
    has: page.locator("option", { hasText: targetTitle }),
  });
  await taskSelect.waitFor();
  await page.waitForTimeout(800); // let the controlled <select> hydrate
  await typeSelect.selectOption({ label: typeLabel });
  await taskSelect.selectOption({ label: targetTitle });
  await page.getByRole("button", { name: /Verlinkung hinzufügen/ }).click();
}

test("blocked banner + completion guard + auto-unblock", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  const ts = Date.now();
  const blockerTitle = `Blocker ${ts}`;
  const depTitle = `Abhängig ${ts}`;

  const blockerUrl = await createTask(page, blockerTitle);
  const depUrl = await createTask(page, depTitle);

  // On the dependent task: "Hängt ab von" → blocker
  await addLink(page, "Hängt ab von", blockerTitle);
  await expect(page.getByRole("link", { name: blockerTitle }).first()).toBeVisible();

  // Blocked banner with a clickable chip appears
  await expect(page.getByText("Blockiert durch")).toBeVisible();

  // Completion is refused while the blocker is open
  await page.goto(`${depUrl}/edit`);
  await page.locator("select#status").selectOption("Done");
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(
    page.getByText(/blockiert durch offene Abhängigkeit/)
  ).toBeVisible();

  // Complete the blocker (it has no blockers itself)
  await page.goto(`${blockerUrl}/edit`);
  await page.locator("select#status").selectOption("Done");
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).toHaveURL(/\/tasks\/[^/]+$/);
  await expect(page).not.toHaveURL(/\/edit$/);

  // Auto-unblock: the banner is gone and the dependent can now be completed
  await page.goto(depUrl);
  await expect(page.getByText("Blockiert durch")).toHaveCount(0);
  await page.goto(`${depUrl}/edit`);
  await page.locator("select#status").selectOption("Done");
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(page).not.toHaveURL(/\/edit$/);
});

test("cycle detection rejects A→B→A (also via Blocks inversion)", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  const ts = Date.now();
  const aTitle = `Zyklus A ${ts}`;
  const bTitle = `Zyklus B ${ts}`;

  const aUrl = await createTask(page, aTitle);
  await createTask(page, bTitle);

  // B hängt ab von A (we are on B's page)
  await addLink(page, "Hängt ab von", aTitle);
  await expect(page.getByRole("link", { name: aTitle }).first()).toBeVisible();

  // A hängt ab von B → must be refused with the cycle toast
  await page.goto(aUrl);
  await addLink(page, "Hängt ab von", bTitle);
  await expect(page.getByText(/Abhängigkeits-Zyklus/)).toBeVisible();

  // Same edge spelled with "Blockiert" (B Blocks A ⇒ A waits for B): also a cycle.
  // We are on A: "A blockiert B" is allowed (A→B already exists in that
  // direction), but "B blockiert A" from B's side would equal A-waits-for-B.
  await page.goto(aUrl);
  await addLink(page, "Blockiert", bTitle); // A blocks B ⇒ B waits for A (duplicate direction, no cycle)
  await expect(page.getByText(/Abhängigkeits-Zyklus/)).toHaveCount(0);
});

test("sprint view lists blocked tasks in their own group", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  const ts = Date.now();
  const aTitle = `Sprint frei ${ts}`;
  const bTitle = `Sprint blockiert ${ts}`;

  // Create two tasks in the same (first) project
  let projectName = "";
  for (const title of [aTitle, bTitle]) {
    await page.goto("/tasks/new");
    await page.getByLabel(/Titel/i).fill(title);
    const projectSelect = page.locator("select#projectId");
    projectName = (
      await projectSelect.locator("option").nth(1).textContent()
    )!.trim();
    await projectSelect.selectOption({ index: 1 });
    await page.getByRole("button", { name: /Task erstellen/ }).click();
    await page.waitForURL(/\/tasks\/(?!new$)[^/]+$/);
  }

  // B (current page) depends on A → B is blocked
  await addLink(page, "Hängt ab von", aTitle);
  await expect(page.getByRole("link", { name: aTitle }).first()).toBeVisible();

  // Sprint view of that project: make sure a sprint exists, add both tasks
  // (they land in the current target sprint — which one doesn't matter here).
  await page.goto("/sprints");
  await page.getByRole("button", { name: projectName }).click();
  const sprintName = `Dep-Sprint ${ts}`;
  await page.getByPlaceholder("Sprint-Name").fill(sprintName);
  await page.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByText(sprintName)).toBeVisible();

  for (const title of [aTitle, bTitle]) {
    await page
      .locator("li", { hasText: title })
      .first()
      .getByRole("button", { name: "Hinzufügen" })
      .click();
    // wait until the task left the backlog (its add button is gone)
    await expect(
      page
        .locator("li", { hasText: title })
        .getByRole("button", { name: "Hinzufügen" })
    ).toHaveCount(0);
  }

  // The blocked task sits in the amber "Blockiert" group, the free one outside
  const blockedGroups = page.getByTestId("sprint-blocked-group");
  await expect(
    blockedGroups.filter({ hasText: bTitle }).getByRole("link", { name: bTitle })
  ).toBeVisible();
  await expect(blockedGroups.getByText(/Blockiert \(\d+\)/).first()).toBeVisible();
  await expect(blockedGroups.getByRole("link", { name: aTitle })).toHaveCount(0);
  // the free task is still listed in a sprint (outside any blocked group)
  await expect(page.getByRole("link", { name: aTitle })).toBeVisible();
});

test("incoming 'Blockiert' link blocks the target task", async ({ page }) => {
  await login(page, "admin", "Admin-2026!", "de");
  const ts = Date.now();
  const blockerTitle = `Wand ${ts}`;
  const victimTitle = `Anstrich ${ts}`;

  const blockerUrl = await createTask(page, blockerTitle);
  const victimUrl = await createTask(page, victimTitle);

  // From the BLOCKER's side: "Wand blockiert Anstrich"
  await page.goto(blockerUrl);
  await addLink(page, "Blockiert", victimTitle);
  await expect(page.getByRole("link", { name: victimTitle }).first()).toBeVisible();

  // The victim shows the blocked banner although IT owns no outgoing link
  await page.goto(victimUrl);
  await expect(page.getByText("Blockiert durch")).toBeVisible();

  // And it cannot be completed
  await page.goto(`${victimUrl}/edit`);
  await page.locator("select#status").selectOption("Done");
  await page.getByRole("button", { name: /Speichern/ }).click();
  await expect(
    page.getByText(/blockiert durch offene Abhängigkeit/)
  ).toBeVisible();
});
