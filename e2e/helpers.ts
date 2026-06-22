import { type Page } from "@playwright/test";

export const BASE = `http://localhost:${process.env.E2E_PORT ?? "3100"}`;

/** Force a known UI locale via the locale cookie before navigating. */
export async function useLocale(page: Page, locale: "ar" | "en" | "de") {
  await page.context().addCookies([
    { name: "tt_locale", value: locale, url: BASE },
  ]);
}

export async function login(
  page: Page,
  username: string,
  password: string,
  locale?: "ar" | "en" | "de"
) {
  await page.goto("/login");
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("/");
  // login applies the user's saved locale; re-pin for deterministic assertions
  if (locale) {
    await useLocale(page, locale);
    await page.reload();
  }
}
