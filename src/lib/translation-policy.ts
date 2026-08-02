import { createHash } from "crypto";
import { isLocale, type Locale } from "./enums";

/**
 * Auto-translation policy (Kundenwunsch 2026-08-02, verengt am selben Tag):
 * translated is ONLY the Turkish↔other direction — the Turkish speakers don't
 * read ar/de/en and vice versa; the ar/de/en group is multilingual among
 * itself, so e.g. German users must NEVER see Arabic content translated.
 * Pure + unit-tested; the DB/cache layer lives in content-translation.ts.
 */
export function shouldTranslate(
  sourceLang: string | null | undefined,
  targetLang: string | null | undefined
): boolean {
  if (!sourceLang || !targetLang) return false;
  if (!isLocale(sourceLang) || !isLocale(targetLang)) return false;
  const involvesTr = sourceLang === "tr" || targetLang === "tr";
  return involvesTr && sourceLang !== targetLang;
}

/** Cache key for a piece of source text (editable content: edit → new hash). */
export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Narrow a stored/detected language string to a Locale or null. */
export function asLocale(v: string | null | undefined): Locale | null {
  return v && isLocale(v) ? v : null;
}
