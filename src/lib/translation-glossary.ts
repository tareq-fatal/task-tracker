// SECURITY: Only local LibreTranslate. NO external translation APIs.
// Military data must stay on-premise. Do not add DeepL, Google, Azure, or
// LLM-based translation. (Kunden-Entscheidung 2026-08-03.)
//
// Offline glossary layer: domain terms are masked with NUMERIC placeholders
// before LibreTranslate sees the text and restored in the target language
// afterwards — empirically only pure digit tokens survive the models
// untouched (⟦…⟧, <x1>, letter tokens all get mangled). Guarantees
// consistent terminology; it cannot fix grammar. Pure + unit-tested.
import type { Locale } from "./enums";

type GlossaryEntry = {
  /** Per locale: [0] = canonical output form, rest = additional match forms. */
  forms: Record<Locale, string[]>;
};

// Starter set: Kunden-Beispiele (brigade/battalion/regiment) + Begriffe aus
// der Qualitätsanalyse 2026-08-02. Erweiterbar — die echte Liste liefert der
// Kunde; neue Einträge hier ergänzen (alle vier Sprachen pflegen).
export const MILITARY_GLOSSARY: GlossaryEntry[] = [
  { forms: { en: ["brigade"], ar: ["لواء"], tr: ["tugay"], de: ["Brigade"] } },
  { forms: { en: ["battalion"], ar: ["كتيبة"], tr: ["tabur"], de: ["Bataillon"] } },
  { forms: { en: ["regiment"], ar: ["فوج"], tr: ["alay"], de: ["Regiment"] } },
  { forms: { en: ["patrol boat"], ar: ["قارب الدورية", "زورق الدورية"], tr: ["devriye botu"], de: ["Patrouillenboot"] } },
  { forms: { en: ["duty officer"], ar: ["الضابط المناوب"], tr: ["nöbetçi subay"], de: ["wachhabender Offizier", "wachhabende Offizier"] } },
  { forms: { en: ["restricted area"], ar: ["منطقة محظورة"], tr: ["yasak bölge"], de: ["Sperrgebiet"] } },
  { forms: { en: ["guard post"], ar: ["نقطة الحراسة"], tr: ["nöbet yeri"], de: ["Wachposten"] } },
  { forms: { en: ["maintenance schedule"], ar: ["خطة الصيانة"], tr: ["bakım planı"], de: ["Wartungsplan"] } },
  { forms: { en: ["harbor crane"], ar: ["رافعة الميناء"], tr: ["liman vinci"], de: ["Hafenkran", "Hafenkräne"] } },
  { forms: { en: ["quay"], ar: ["رصيف الميناء"], tr: ["rıhtım"], de: ["Kai"] } },
  { forms: { en: ["radar calibration"], ar: ["معايرة الرادار"], tr: ["radar kalibrasyonu"], de: ["Radarkalibrierung"] } },
  { forms: { en: ["spare part"], ar: ["قطع الغيار"], tr: ["yedek parça"], de: ["Ersatzteil", "Ersatzteile"] } },
];

export type GlossarySlot = { token: string; replacement: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Turkish agglutinates case suffixes onto the noun ("tugayı", "tabura") — the
// match consumes them so no orphaned suffix sticks to the placeholder. The
// restored term is the canonical (uninflected) form: terminology consistency
// beats perfect case marking, per the customer's priority.
const TR_SUFFIX = "[a-zçğıiöşü']*";

function formPattern(form: string, sourceLang: Locale): RegExp {
  const escaped = escapeRe(form).replace(/\s+/g, "\\s+");
  if (sourceLang === "tr") return new RegExp(`(?<![\\p{L}])${escaped}${TR_SUFFIX}(?![\\p{L}])`, "giu");
  return new RegExp(`(?<![\\p{L}])${escaped}(?![\\p{L}])`, "giu");
}

/**
 * Mask every glossary term of `sourceLang` found in `text` with a numeric
 * token; returns the masked text plus the slots to restore. No terms found →
 * masked === text and slots is empty.
 */
export function applyGlossary(
  text: string,
  sourceLang: Locale,
  targetLang: Locale
): { masked: string; slots: GlossarySlot[] } {
  let masked = text;
  const slots: GlossarySlot[] = [];
  let seq = 0;
  for (const entry of MILITARY_GLOSSARY) {
    const sourceForms = entry.forms[sourceLang] ?? [];
    const replacement = entry.forms[targetLang]?.[0];
    if (!replacement) continue;
    // longest form first so "patrol boat" wins over a hypothetical "boat"
    for (const form of [...sourceForms].sort((a, b) => b.length - a.length)) {
      const re = formPattern(form, sourceLang);
      if (!re.test(masked)) continue;
      let token: string;
      do {
        token = String(731000 + seq++);
      } while (text.includes(token) || masked.includes(token));
      masked = masked.replace(re, token);
      slots.push({ token, replacement });
    }
  }
  return { masked, slots };
}

/**
 * Put the target-language terms back. Returns null when a token did not
 * survive the model (happens occasionally) — the caller then retries WITHOUT
 * the glossary so the user never sees a dangling number.
 */
export function restoreGlossary(translated: string, slots: GlossarySlot[]): string | null {
  let out = translated;
  for (const { token, replacement } of slots) {
    if (!out.includes(token)) return null;
    out = out.split(token).join(replacement);
  }
  return out;
}
