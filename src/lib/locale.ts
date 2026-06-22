import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./enums";

export const LOCALE_COOKIE = "tt_locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Active display locale: cookie value or the default (Arabic). */
export function getActiveLocale(): Locale {
  const v = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export function setLocaleCookie(locale: Locale): void {
  cookies().set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}
