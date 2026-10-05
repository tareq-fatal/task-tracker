// Schlagworte an Aufgaben — frei vergeben, mehrere je Aufgabe.
//
// Warum normalisiert und nicht roh gespeichert: ein Filter auf Schlagworte ist
// nur brauchbar, wenn „Live-Feedback", „live feedback" und „LIVE-FEEDBACK"
// dasselbe treffen. Die Regel steht genau hier, damit Formular, Schnittstelle
// und Filter nicht drei verschiedene Vorstellungen davon haben.

/** Mehr als das trägt keine Aufgabe sinnvoll — der Rest fällt weg, statt zu scheitern. */
export const MAX_TAGS = 12;
/** Ein Schlagwort ist ein Wort, kein Satz. */
export const MAX_TAG_LEN = 24;

/**
 * Ein einzelnes Schlagwort in die Normalform bringen: klein, ohne Leerzeichen,
 * nur Buchstaben/Zahlen/Bindestrich. Umlaute bleiben erhalten (deutsche
 * Schlagworte sollen aussehen wie deutsche Wörter). Ergibt "" , wenn nichts
 * Verwertbares übrig bleibt — der Aufrufer wirft das weg.
 */
export function normalizeTag(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-") // Leerzeichen, Unterstriche, Satzzeichen → ein Bindestrich
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LEN)
    .replace(/-+$/g, ""); // falls der Schnitt mitten in einem Bindestrich endete
}

/**
 * Eine Eingabe (Formularzeile oder Liste) in eine saubere, doppelfreie Liste
 * verwandeln. Trennzeichen sind Komma, Semikolon und Zeilenumbruch — das
 * Leerzeichen ausdrücklich NICHT: „live feedback, qs" soll zwei Schlagworte
 * ergeben und nicht drei. Innere Leerzeichen werden zum Bindestrich.
 * Die Reihenfolge der Eingabe bleibt erhalten.
 */
export function parseTags(input: string | string[] | null | undefined): string[] {
  const parts = Array.isArray(input)
    ? input
    : String(input ?? "").split(/[,;\n\r\t]+/);
  const out: string[] = [];
  for (const p of parts) {
    const tag = normalizeTag(p);
    if (!tag || out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Schlagworte zusammenführen (vorhandene + neue), ohne Doppelte, mit Deckel. */
export function mergeTags(current: string[], add: string | string[]): string[] {
  return parseTags([...(current ?? []), ...parseTags(add)]);
}

/** Schlagworte entfernen — was nicht da ist, wird stillschweigend ignoriert. */
export function removeTags(current: string[], drop: string | string[]): string[] {
  const gone = new Set(parseTags(drop));
  return parseTags(current ?? []).filter((t) => !gone.has(t));
}

/** Für die Anzeige: dieselbe Liste, aber alphabetisch (deutsche Sortierung). */
export function sortTags(tags: string[]): string[] {
  return [...(tags ?? [])].sort((a, b) => a.localeCompare(b, "de"));
}
