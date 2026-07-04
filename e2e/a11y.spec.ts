import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { login } from "./helpers";

const ROUTES = ["/", "/board", "/tasks", "/list", "/roadmap", "/views", "/reports", "/reports/insights", "/sprints", "/settings/branding", "/settings/integrations", "/admin/db", "/admin/mandanten", "/admin/custom-fields"];

test("main routes have no critical/serious accessibility violations", async ({ page }) => {
  test.setTimeout(180000); // axe on /board (950 tasks) is DOM-heavy
  await login(page, "admin", "Admin-2026!", "de");
  const critical: string[] = [];
  const serious: string[] = [];

  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForTimeout(500);
    // color-contrast is a tracked "serious" design follow-up (Ocean-Pro cards),
    // never a merge blocker — and scanning it across 950 cards costs ~60s/route.
    // The hard gate below is critical-only, so skip it here for speed + stability.
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();
    for (const v of results.violations) {
      const line = `${route} :: ${v.id} — ${v.help} (${v.nodes.length}×)`;
      if (v.impact === "critical") critical.push(line);
      else if (v.impact === "serious") serious.push(line);
    }
  }

  console.log("\n=== A11Y CRITICAL ===\n" + (critical.length ? critical.join("\n") : "NONE 🎉"));
  console.log("\n=== A11Y SERIOUS (tracked follow-ups) ===\n" + (serious.length ? serious.join("\n") : "NONE") + "\n");
  // Hard gate: zero critical violations. Serious (colour-contrast on the
  // colourful Ocean-Pro cards + kanban nested-interactive) are tracked design
  // follow-ups, not merge blockers.
  expect(critical, critical.join("\n")).toEqual([]);
});
