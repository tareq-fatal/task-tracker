// Wie ein Kommentartext in sichtbare Erwähnungen zerfällt — rein, ohne I/O
// und ohne React, damit Browser und Schnittstelle exakt dieselbe Regel
// verwenden wie `parseMentions` in notifications-core.

/** Ein Textstück: entweder gewöhnlicher Text oder eine aufgelöste Erwähnung. */
export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; username: string; userId: string; name: string };

export type KnownUser = { id: string; username: string; name: string };

// Dieselbe Grammatik wie parseMentions: eine Erwähnung beginnt am Textanfang
// oder nach einem Zeichen, das nicht Teil eines Benutzernamens sein kann —
// so wird aus „a@b.de" nie eine Erwähnung.
const MENTION_RE = /(^|[^a-zA-Z0-9_.-])@([a-zA-Z0-9_.-]{2,30})/g;

/**
 * Zerlegt `text` in Segmente. **Nur bekannte Benutzernamen werden zu
 * Erwähnungen** — alles andere bleibt wörtlich stehen. Ein Tippfehler wird
 * damit sichtbar als gewöhnlicher Text angezeigt und nicht stillschweigend
 * als Erwähnung verschluckt.
 *
 * Der längste passende Name gewinnt nicht: die Grammatik ist eindeutig, weil
 * ein Benutzername an einem Zeichen endet, das nicht mehr dazugehört.
 */
export function splitMentions(text: string, known: KnownUser[]): MentionSegment[] {
  const byName = new Map(known.map((u) => [u.username.toLowerCase(), u]));
  const out: MentionSegment[] = [];
  let last = 0;

  const push = (value: string) => {
    if (!value) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === "text") prev.value += value;
    else out.push({ type: "text", value });
  };

  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const [full, lead, name] = m;
    const user = byName.get(name.toLowerCase());
    if (!user) continue; // unbekannt → bleibt Text, wird unten mitgenommen
    const at = m.index + lead.length;
    push(text.slice(last, at));
    out.push({
      type: "mention",
      value: `@${name}`,
      username: user.username,
      userId: user.id,
      name: user.name,
    });
    last = m.index + full.length;
  }
  push(text.slice(last));
  return out;
}

/**
 * Welche der erwähnten Namen es im Mandanten gar nicht gibt. Die Schnittstelle
 * gibt das zurück, damit eine Sitzung merkt, dass ihr `@tarekfatl` niemanden
 * erreicht hat, statt es für zugestellt zu halten.
 */
export function unknownMentions(text: string, known: KnownUser[]): string[] {
  const byName = new Set(known.map((u) => u.username.toLowerCase()));
  const out = new Set<string>();
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(text)) !== null) {
    const name = m[2].toLowerCase();
    if (!byName.has(name)) out.add(name);
  }
  return [...out];
}
