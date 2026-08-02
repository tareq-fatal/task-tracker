import "server-only";
import { prisma } from "./prisma";
import { translateText, translationConfigured, TranslateError } from "./translate";
import { detectCommentLanguage } from "./lang-detect";
import { shouldTranslate, contentHash, asLocale } from "./translation-policy";
import type { Locale } from "./enums";

export type AutoTranslation = { text: string; sourceLang: Locale };

/**
 * Global upstream budget for AUTO translation (cache misses only). The
 * interactive per-user limiter in translate.ts stays untouched — this one
 * protects LibreTranslate from render-triggered bursts (e.g. first view of a
 * long Turkish comment thread). Beyond the budget we silently render the
 * original; the next render retries. In-memory is fine: single container.
 */
const WINDOW_MS = 60_000;
const MAX_UPSTREAM_PER_WINDOW = 30;
let windowStart = 0;
let windowCount = 0;

function upstreamBudgetOk(now = Date.now()): boolean {
  if (now - windowStart > WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= MAX_UPSTREAM_PER_WINDOW) return false;
  windowCount++;
  return true;
}

/** Test hook. */
export function _resetUpstreamBudget(): void {
  windowStart = 0;
  windowCount = 0;
}

/** Detect the content language of arbitrary text (local heuristic, no I/O). */
export function detectContentLanguage(text: string): Locale | null {
  return detectCommentLanguage(text);
}

/**
 * TR↔x display translation with DB cache. Returns null whenever the original
 * should be shown: policy says no, feature unconfigured, empty text, budget
 * exhausted, or the provider failed (fallback original — never an error page).
 */
export async function getAutoTranslation(
  text: string | null | undefined,
  sourceLang: string | null | undefined,
  targetLang: Locale
): Promise<AutoTranslation | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const source = asLocale(sourceLang) ?? detectContentLanguage(trimmed);
  if (!source || !shouldTranslate(source, targetLang)) return null;
  if (!translationConfigured()) return null;

  const hash = contentHash(trimmed);
  const cached = await prisma.contentTranslation.findUnique({
    where: { contentHash_targetLang: { contentHash: hash, targetLang } },
  });
  if (cached) return { text: cached.translatedText, sourceLang: source };

  if (!upstreamBudgetOk()) return null;
  try {
    const res = await translateText(trimmed, targetLang, source);
    await prisma.contentTranslation
      .create({
        data: {
          contentHash: hash,
          sourceLang: source,
          targetLang,
          translatedText: res.text,
        },
      })
      .catch(() => {}); // unique-key race with a parallel render — theirs won
    return { text: res.text, sourceLang: source };
  } catch (e) {
    if (!(e instanceof TranslateError)) throw e;
    console.warn(`[auto-translate] upstream ${e.reason} (${source}→${targetLang}) — serving original`);
    return null;
  }
}
