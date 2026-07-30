import type { Locale } from "./enums";

// Server-side translation clients for comment auto-translation. Keys/URLs
// never reach the client — translation happens exclusively through
// POST /api/comments/[id]/translate.
//
// Providers, in preference order:
//   1. DeepL   — DEEPL_API_KEY set (":fx" suffix → api-free.deepl.com)
//   2. LibreTranslate — LIBRETRANSLATE_URL set (self-hosted container on the
//      VPS, customer decision 2026-07-29: no external service, no API cost)
// Neither configured → the whole feature is OFF (no links in the UI, the
// tenant admin panel shows a hint).

export function translationConfigured(): boolean {
  return Boolean(process.env.DEEPL_API_KEY || process.env.LIBRETRANSLATE_URL);
}

/** Provider dispatcher — the API route calls this, not a specific client. */
export async function translateText(
  text: string,
  target: Locale,
  source?: Locale | null
): Promise<{ text: string; detectedSource: string }> {
  if (process.env.DEEPL_API_KEY) return deeplTranslate(text, target, source);
  if (process.env.LIBRETRANSLATE_URL) return libreTranslate(text, target, source);
  throw new TranslateError("not_configured");
}

function apiBase(key: string): string {
  return key.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
}

// DeepL language codes. Target EN must be a variant (plain "EN" is
// deprecated as target); as SOURCE the plain codes are correct.
const TARGET_CODE: Record<Locale, string> = {
  ar: "AR",
  de: "DE",
  en: "EN-US",
  tr: "TR",
};
const SOURCE_CODE: Record<Locale, string> = { ar: "AR", de: "DE", en: "EN", tr: "TR" };

export class TranslateError extends Error {
  constructor(public readonly reason: "not_configured" | "rate_limited" | "upstream") {
    super(reason);
  }
}

/**
 * Translate `text` into `target`. `source` is passed when we trust our own
 * detection; otherwise DeepL auto-detects. Returns the translation plus the
 * source language DeepL actually saw (lowercased, e.g. "tr").
 */
export async function deeplTranslate(
  text: string,
  target: Locale,
  source?: Locale | null
): Promise<{ text: string; detectedSource: string }> {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new TranslateError("not_configured");

  const body = new URLSearchParams({ target_lang: TARGET_CODE[target] });
  body.append("text", text);
  if (source) body.set("source_lang", SOURCE_CODE[source]);

  const res = await fetch(`${apiBase(key)}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    // Belt and braces: never let a slow upstream hold the request forever.
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429 || res.status === 456) throw new TranslateError("rate_limited");
  if (!res.ok) throw new TranslateError("upstream");
  const json = (await res.json().catch(() => null)) as {
    translations?: { text: string; detected_source_language?: string }[];
  } | null;
  const first = json?.translations?.[0];
  if (!first) throw new TranslateError("upstream");
  return {
    text: first.text,
    detectedSource: (first.detected_source_language ?? source ?? "").toLowerCase(),
  };
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
