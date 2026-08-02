import type { Locale } from "./enums";
import { applyGlossary, restoreGlossary } from "./translation-glossary";

// =============================================================================
// SECURITY: Only local LibreTranslate. NO external translation APIs.
// Military data must stay on-premise. Do not add DeepL, Google, Azure, or
// LLM-based translation. (Kunden-Entscheidung 2026-08-03 — frühere DeepL-
// Anbindung wurde auf dieselbe Anweisung hin vollständig entfernt.)
// =============================================================================
//
// Single provider: the self-hosted LibreTranslate container on the VPS,
// configured via LIBRETRANSLATE_URL (+ optional LIBRETRANSLATE_API_KEY).
// Not configured → the whole feature is OFF (no links in the UI, the tenant
// admin panel shows a hint).
//
// Quality within the on-prem constraint comes from the offline glossary
// layer (translation-glossary.ts): domain terms are masked with numeric
// placeholders around the model call and restored in the target language —
// consistent terminology without any external service.

export function translationConfigured(): boolean {
  return Boolean(process.env.LIBRETRANSLATE_URL);
}

export class TranslateError extends Error {
  constructor(public readonly reason: "not_configured" | "rate_limited" | "upstream") {
    super(reason);
  }
}

/**
 * Translate `text` into `target` via the LOCAL LibreTranslate, with the
 * glossary layer applied when the source language is known. If a placeholder
 * does not survive the model (rare), the call transparently retries without
 * the glossary — never worse than a plain translation, never a dangling token.
 */
export async function translateText(
  text: string,
  target: Locale,
  source?: Locale | null
): Promise<{ text: string; detectedSource: string }> {
  if (!process.env.LIBRETRANSLATE_URL) throw new TranslateError("not_configured");

  if (source) {
    const { masked, slots } = applyGlossary(text, source, target);
    if (slots.length > 0) {
      const res = await libreTranslate(masked, target, source);
      const restored = restoreGlossary(res.text, slots);
      if (restored !== null) return { ...res, text: restored };
      // token lost in the model → plain retry below
    }
  }
  return libreTranslate(text, target, source);
}

/**
 * LibreTranslate (self-hosted). Speaks lowercase ISO codes directly, so our
 * Locale values pass through as-is; `source: "auto"` enables its detector and
 * the response then carries `detectedLanguage.language`.
 */
export async function libreTranslate(
  text: string,
  target: Locale,
  source?: Locale | null
): Promise<{ text: string; detectedSource: string }> {
  const base = process.env.LIBRETRANSLATE_URL;
  if (!base) throw new TranslateError("not_configured");

  const res = await fetch(`${base.replace(/\/$/, "")}/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: source ?? "auto",
      target,
      format: "text",
      ...(process.env.LIBRETRANSLATE_API_KEY
        ? { api_key: process.env.LIBRETRANSLATE_API_KEY }
        : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) throw new TranslateError("rate_limited");
  if (!res.ok) throw new TranslateError("upstream");
  const json = (await res.json().catch(() => null)) as {
    translatedText?: string;
    detectedLanguage?: { language?: string };
  } | null;
  if (typeof json?.translatedText !== "string" || !json.translatedText) {
    throw new TranslateError("upstream");
  }
  return {
    text: json.translatedText,
    detectedSource: (json.detectedLanguage?.language ?? source ?? "").toLowerCase(),
  };
}

/* ---------------- per-user rate limit (cost control) ---------------- */

const WINDOW_MS = 60_000;
export const MAX_PER_WINDOW = 10; // requests/min per user, per the order

const hits = new Map<string, number[]>();

/** Sliding-window limiter. In-memory is fine: the app runs as one container. */
export function checkTranslateRateLimit(userId: string, now = Date.now()): boolean {
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    hits.set(userId, arr);
    return false;
  }
  arr.push(now);
  hits.set(userId, arr);
  return true;
}

/** Test hook. */
export function _resetTranslateRateLimit(): void {
  hits.clear();
}
