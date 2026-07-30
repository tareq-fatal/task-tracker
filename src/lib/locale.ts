import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./enums";

export const LOCALE_COOKIE = "tt_locale";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Instance-wide default for visitors with no locale cookie yet — i.e. the
 *  language the login page comes up in. Server-side env (NOT NEXT_PUBLIC_), so
 *  a self-hosted instance can set it in .env without rebuilding the image.
 *  Unset or invalid → DEFAULT_LOCALE (Arabic), the previous behaviour. */
function instanceDefaultLocale(): Locale {
  const v = process.env.DEFAULT_LOCALE;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** Active display locale: cookie value, else the instance default. */
export function getActiveLocale(): Locale {
  const v = cookies().get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : instanceDefaultLocale();
}

export function setLocaleCookie(locale: Locale): void {
  cookies().set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
}
