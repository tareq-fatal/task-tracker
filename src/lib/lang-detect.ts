import type { Locale } from "./enums";

// Tiny language detector for the ONLY four languages the app speaks
// (ar/de/en/tr) — deliberately dependency-free instead of franc: on short
// comment texts a closed 4-language scorer beats a 180-language classifier,
// and there is nothing to mis-detect into. Returns null when unsure; the
// caller falls back to the author's UI locale (per the order).

// Characters that exist in exactly one of the Latin-script trio.
const TR_ONLY = /[ğĞıİşŞ]/; // ç/ö/ü are shared with de/fr, these are not
const DE_ONLY = /[ßẞ]/;

// Minimal high-frequency stopword lists — function words only, so they also
// fire on short sentences.
const STOP: Record<"de" | "en" | "tr", string[]> = {
  de: ["der", "die", "das", "und", "ist", "nicht", "ich", "wir", "eine", "ein", "mit", "für", "auf", "wurde", "bitte", "noch", "schon", "morgen", "heute", "fertig"],
  en: ["the", "and", "is", "not", "have", "this", "that", "with", "for", "please", "done", "will", "was", "are", "you", "task", "today", "tomorrow"],
  tr: ["ve", "bir", "bu", "için", "ile", "değil", "tamam", "görev", "yarın", "bugün", "lütfen", "oldu", "var", "yok", "ben", "biz", "daha", "çok"],
};

export function detectCommentLanguage(text: string): Locale | null {
  const s = text.trim();
  if (!s) return null;

  // Arabic script is unambiguous.
  const arabicChars = (s.match(/[؀-ۿݐ-ݿ]/g) ?? []).length;
  const letters = (s.match(/[\p{L}]/gu) ?? []).length;
  if (letters === 0) return null;
  if (arabicChars / letters > 0.5) return "ar";

  if (TR_ONLY.test(s)) return "tr";
  if (DE_ONLY.test(s)) return "de";

  // Stopword vote across the Latin trio.
  const words = s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  if (words.length === 0) return null;
  const score = { de: 0, en: 0, tr: 0 };
  for (const w of words) {
    for (const lang of ["de", "en", "tr"] as const) {
      if (STOP[lang].includes(w)) score[lang]++;
    }
  }
  const best = (Object.entries(score) as ["de" | "en" | "tr", number][]).sort(
    (a, b) => b[1] - a[1]
  );
  // Require a clear winner with at least one hit — otherwise "unsure".
  if (best[0][1] === 0 || best[0][1] === best[1][1]) return null;
  return best[0][0];
}
